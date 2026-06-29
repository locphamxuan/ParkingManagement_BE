const ParkingSlot = require("../../models/building/ParkingSlot");
const Floor = require("../../models/building/Floor");
const Zone = require("../../models/building/Zone");
const AppError = require("../../utils/AppError");
const { ensureManagerOwnsBuilding } = require("../../utils/managerScope");
const { writeAuditLog } = require("../../utils/audit");

const ensureFloorBelongsToBuilding = async (floorId, buildingId) => {
  const floor = await Floor.findOne({ _id: floorId, building: buildingId });
  if (!floor) throw new AppError("Floor not found in this building", 404);
  return floor;
};

// Ép sức chứa tầng: số slot hiện có trên tầng không được vượt floor.capacity.
// capacity = 0 nghĩa là KHÔNG giới hạn (không phải "0 slot") — giữ tương thích dữ liệu cũ.
const assertFloorCapacity = async (floor) => {
  const cap = Number(floor.capacity || 0);
  if (cap <= 0) return;
  const count = await ParkingSlot.countDocuments({ floor: floor._id });
  if (count >= cap) {
    throw new AppError(
      `Floor capacity reached (${cap} slot(s)). Increase the floor capacity to add more.`,
      409,
      "FLOOR_CAPACITY_REACHED",
    );
  }
};

// Ép sức chứa dãy: số slot trong dãy không được vượt zone.capacity (0 = không giới hạn).
const assertZoneCapacity = async (zone) => {
  const cap = Number(zone.capacity || 0);
  if (cap <= 0) return;
  const count = await ParkingSlot.countDocuments({ zone: zone._id });
  if (count >= cap) {
    throw new AppError(
      `Zone "${zone.code}" is full (${count}/${cap} slots). Increase this zone's capacity or create another zone on the floor.`,
      409,
      "ZONE_CAPACITY_REACHED",
    );
  }
};

// Dãy phải thuộc đúng building, và (nếu có floor) phải nằm trong floor đó.
const ensureZoneMatches = async (zoneId, buildingId, floorId) => {
  const zone = await Zone.findOne({ _id: zoneId, building: buildingId });
  if (!zone) throw new AppError("Zone not found in this building", 404);
  if (floorId && String(zone.floor) !== String(floorId)) {
    throw new AppError("Zone does not belong to the given floor", 400);
  }
  return zone;
};

const list = async (user, buildingId, query = {}) => {
  ensureManagerOwnsBuilding(user, buildingId);
  const filter = { building: buildingId };
  if (query.floor) filter.floor = query.floor;
  if (query.status) filter.status = query.status;
  if (query.zone) filter.zone = query.zone;
  if (query.usageType) filter.usageType = query.usageType;
  return ParkingSlot.find(filter)
    .populate("floor", "code")
    .populate("zone", "code usageType vehicleType")
    .populate("vehicleType", "code name")
    .sort({ floor: 1, code: 1 });
};

const create = async (user, buildingId, payload) => {
  ensureManagerOwnsBuilding(user, buildingId);
  if (!payload.floor) throw new AppError("floor is required", 400);
  const floor = await ensureFloorBelongsToBuilding(payload.floor, buildingId);
  if (!payload.zone) throw new AppError("zone is required", 400);
  // Loại xe + đối tượng được lấy (denormalize) từ DÃY (Zone) chứa slot.
  const zone = await ensureZoneMatches(payload.zone, buildingId, payload.floor);
  // Không cho tạo vượt sức chứa tầng VÀ sức chứa dãy.
  await assertFloorCapacity(floor);
  await assertZoneCapacity(zone);

  const created = await ParkingSlot.create({
    building: buildingId,
    floor: payload.floor,
    zone: zone._id,
    code: String(payload.code || "").trim().toUpperCase(),
    vehicleType: zone.vehicleType,
    usageType: zone.usageType,
    status: payload.status || "available",
    reservable: payload.reservable !== false,
    note: payload.note || "",
  });
  await writeAuditLog({
    actor: user,
    action: "CREATE_PARKING_SLOT",
    targetTable: "parking_slots",
    targetId: created._id,
    building: buildingId,
    newValue: created.toObject(),
  });
  return created;
};

const update = async (user, buildingId, id, payload) => {
  ensureManagerOwnsBuilding(user, buildingId);
  const current = await ParkingSlot.findOne({
    _id: id,
    building: buildingId,
  });
  if (!current) throw new AppError("Slot not found", 404);

  const update = {};
  if (payload.code !== undefined)
    update.code = String(payload.code).trim().toUpperCase();
  if (payload.status !== undefined) update.status = payload.status;
  if (payload.reservable !== undefined) update.reservable = !!payload.reservable;
  if (payload.note !== undefined) update.note = payload.note;
  if (payload.floor !== undefined) {
    const floor = await ensureFloorBelongsToBuilding(payload.floor, buildingId);
    // Chuyển slot sang TẦNG KHÁC → tầng đích phải còn chỗ theo capacity.
    if (String(payload.floor) !== String(current.floor)) {
      await assertFloorCapacity(floor);
    }
    update.floor = payload.floor;
  }
  // Đổi dãy → đồng bộ lại loại xe + đối tượng (denormalize từ zone mới).
  if (payload.zone !== undefined && String(payload.zone) !== String(current.zone || "")) {
    const zone = await ensureZoneMatches(
      payload.zone,
      buildingId,
      payload.floor || current.floor
    );
    // Chuyển slot sang DÃY KHÁC → dãy đích phải còn chỗ theo capacity.
    await assertZoneCapacity(zone);
    update.zone = zone._id;
    update.vehicleType = zone.vehicleType;
    update.usageType = zone.usageType;
  }

  const updated = await ParkingSlot.findByIdAndUpdate(id, update, {
    new: true,
    runValidators: true,
  });
  await writeAuditLog({
    actor: user,
    action: "UPDATE_PARKING_SLOT",
    targetTable: "parking_slots",
    targetId: id,
    building: buildingId,
    previousValue: current.toObject(),
    newValue: updated.toObject(),
  });
  return updated;
};

const updateStatus = async (user, buildingId, id, status) => {
  ensureManagerOwnsBuilding(user, buildingId);
  return update(user, buildingId, id, { status });
};

const remove = async (user, buildingId, id) => {
  ensureManagerOwnsBuilding(user, buildingId);
  const current = await ParkingSlot.findOne({
    _id: id,
    building: buildingId,
  });
  if (!current) throw new AppError("Slot not found", 404);

  if (current.status === "occupied") {
    throw new AppError("Cannot delete an occupied slot", 409);
  }
  await ParkingSlot.deleteOne({ _id: id });
  await writeAuditLog({
    actor: user,
    action: "DELETE_PARKING_SLOT",
    targetTable: "parking_slots",
    targetId: id,
    building: buildingId,
    previousValue: current.toObject(),
    severity: "medium",
  });
  return { id };
};

module.exports = { list, create, update, updateStatus, remove };

