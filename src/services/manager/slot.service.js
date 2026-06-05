const ParkingSlot = require("../../models/building/ParkingSlot");
const Floor = require("../../models/building/Floor");
const AppError = require("../../utils/AppError");
const { ensureManagerOwnsBuilding } = require("../../utils/managerScope");
const { writeAuditLog } = require("../../utils/audit");

const ensureFloorBelongsToBuilding = async (floorId, buildingId) => {
  const floor = await Floor.findOne({ _id: floorId, building: buildingId });
  if (!floor) throw new AppError("Floor not found in this building", 404);
  return floor;
};

const list = async (user, buildingId, query = {}) => {
  ensureManagerOwnsBuilding(user, buildingId);
  const filter = { building: buildingId };
  if (query.floor) filter.floor = query.floor;
  if (query.status) filter.status = query.status;
  return ParkingSlot.find(filter)
    .populate("floor", "code")
    .populate("vehicleType", "code name")
    .sort({ floor: 1, code: 1 });
};

const create = async (user, buildingId, payload) => {
  ensureManagerOwnsBuilding(user, buildingId);
  if (!payload.floor) throw new AppError("floor is required", 400);
  await ensureFloorBelongsToBuilding(payload.floor, buildingId);

  const created = await ParkingSlot.create({
    building: buildingId,
    floor: payload.floor,
    code: String(payload.code || "").trim().toUpperCase(),
    vehicleType: payload.vehicleType || null,
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
  if (payload.vehicleType !== undefined)
    update.vehicleType = payload.vehicleType || null;
  if (payload.status !== undefined) update.status = payload.status;
  if (payload.reservable !== undefined) update.reservable = !!payload.reservable;
  if (payload.note !== undefined) update.note = payload.note;
  if (payload.floor !== undefined) {
    await ensureFloorBelongsToBuilding(payload.floor, buildingId);
    update.floor = payload.floor;
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

