const Zone = require("../../models/building/Zone");
const Floor = require("../../models/building/Floor");
const VehicleType = require("../../models/building/VehicleType");
const ParkingSlot = require("../../models/building/ParkingSlot");
const AppError = require("../../utils/AppError");
const { ensureManagerOwnsBuilding } = require("../../utils/managerScope");
const { writeAuditLog } = require("../../utils/audit");
const { initialsCode, STOP_WORDS_VI } = require("../../utils/codeFromName");

const ensureFloorBelongsToBuilding = async (floorId, buildingId) => {
  const floor = await Floor.findOne({ _id: floorId, building: buildingId });
  if (!floor) throw new AppError("Floor not found in this building", 404);
  return floor;
};

// Loại xe của dãy phải thuộc building VÀ nằm trong danh sách loại xe mà TẦNG cho phép
// (Floor.allowedVehicleTypes do manager tự cấu hình — vẫn "tùy ý", chỉ là quyết định ở
// cấp tầng). Tầng không cấu hình loại xe nào (mảng rỗng) → cho phép mọi loại của building.
const ensureVehicleTypeAllowedOnFloor = async (vehicleTypeId, buildingId, floor) => {
  const vt = await VehicleType.findOne({ _id: vehicleTypeId, building: buildingId });
  if (!vt) throw new AppError("Vehicle type not found in this building", 404);
  const allowed = Array.isArray(floor.allowedVehicleTypes) ? floor.allowedVehicleTypes : [];
  if (allowed.length > 0 && !allowed.some((id) => String(id) === String(vehicleTypeId))) {
    throw new AppError(
      "Vehicle type is not allowed on this floor. Add it to the floor's allowed vehicle types first.",
      400,
      "VEHICLE_TYPE_NOT_ALLOWED_ON_FLOOR",
    );
  }
  return vt;
};

// capacity của dãy = "ngân sách slot" của dãy đó. Phải >= 1.
const assertValidZoneCapacity = (capacity) => {
  if (Number.isNaN(capacity) || capacity < 1) {
    throw new AppError("Zone capacity must be at least 1", 400, "INVALID_ZONE_CAPACITY");
  }
  return capacity;
};

// Tổng capacity các dãy trên 1 tầng KHÔNG được vượt floor.capacity. floor.capacity<=0
// nghĩa là tầng không giới hạn → bỏ qua ràng buộc tổng (tương thích dữ liệu cũ).
const assertZoneCapacityFitsFloor = async (floor, newCapacity, excludeZoneId = null) => {
  const floorCap = Number(floor.capacity || 0);
  if (floorCap <= 0) return;
  const match = { floor: floor._id };
  if (excludeZoneId) match._id = { $ne: excludeZoneId };
  const agg = await Zone.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: "$capacity" } } },
  ]);
  const usedByOthers = agg[0]?.total || 0;
  if (usedByOthers + newCapacity > floorCap) {
    const remaining = Math.max(0, floorCap - usedByOthers);
    throw new AppError(
      `Zone capacity exceeds the floor budget. Floor capacity ${floorCap}, already allocated ${usedByOthers}, remaining ${remaining}.`,
      409,
      "ZONE_CAPACITY_EXCEEDS_FLOOR",
    );
  }
};

const list = async (user, buildingId, query = {}) => {
  ensureManagerOwnsBuilding(user, buildingId);
  const filter = { building: buildingId };
  if (query.floor) filter.floor = query.floor;
  if (query.usageType) filter.usageType = query.usageType;
  if (query.status) filter.status = query.status;
  const zones = await Zone.find(filter)
    .populate("floor", "code name")
    .populate("vehicleType", "code name")
    .sort({ floor: 1, code: 1 })
    .lean();

  // Đính kèm số slot đang có của mỗi dãy để FE hiện "đã dùng / sức chứa".
  const ids = zones.map((z) => z._id);
  const counts = ids.length
    ? await ParkingSlot.aggregate([
        { $match: { zone: { $in: ids } } },
        { $group: { _id: "$zone", n: { $sum: 1 } } },
      ])
    : [];
  const countMap = new Map(counts.map((c) => [String(c._id), c.n]));
  return zones.map((z) => ({ ...z, slotCount: countMap.get(String(z._id)) || 0 }));
};

// Code zone sinh từ tên (bỏ từ phụ: "Dãy cho khách vãng lai" → VL),
// unique theo tầng — trùng thì thêm số đuôi (VL → VL2).
const nextZoneCode = async (floorId, name) => {
  const base = initialsCode(name, { stopWords: STOP_WORDS_VI, maxLen: 4, fallback: "Z" });
  const codes = new Set(await Zone.find({ floor: floorId }).distinct("code"));
  if (!codes.has(base)) return base;
  let n = 2;
  while (codes.has(`${base}${n}`)) n += 1;
  return `${base}${n}`;
};

const create = async (user, buildingId, payload) => {
  ensureManagerOwnsBuilding(user, buildingId);
  if (!payload.floor) throw new AppError("floor is required", 400);
  const floor = await ensureFloorBelongsToBuilding(payload.floor, buildingId);
  await ensureVehicleTypeAllowedOnFloor(payload.vehicleType, buildingId, floor);
  const capacity = assertValidZoneCapacity(Number(payload.capacity));
  await assertZoneCapacityFitsFloor(floor, capacity, null);

  const doc = {
    building: buildingId,
    floor: payload.floor,
    name: String(payload.name || "").trim(),
    vehicleType: payload.vehicleType,
    usageType: payload.usageType,
    capacity,
    status: payload.status || "active",
  };
  let created;
  try {
    created = await Zone.create({ ...doc, code: await nextZoneCode(payload.floor, doc.name) });
  } catch (err) {
    // Race hiếm: 2 request cùng sinh một code → thử lại một lần với code mới.
    if (err?.code !== 11000) throw err;
    created = await Zone.create({ ...doc, code: await nextZoneCode(payload.floor, doc.name) });
  }
  await writeAuditLog({
    actor: user,
    action: "CREATE_ZONE",
    targetTable: "zones",
    targetId: created._id,
    building: buildingId,
    newValue: created.toObject(),
  });
  return created;
};

// Cập nhật zone → đồng bộ (denormalize) vehicleType/usageType xuống mọi slot thuộc zone.
const propagateToSlots = async (zone) => {
  await ParkingSlot.updateMany(
    { zone: zone._id },
    { $set: { vehicleType: zone.vehicleType, usageType: zone.usageType } }
  );
};

const update = async (user, buildingId, id, payload) => {
  ensureManagerOwnsBuilding(user, buildingId);
  const current = await Zone.findOne({ _id: id, building: buildingId });
  if (!current) throw new AppError("Zone not found", 404);

  const update = {};
  if (payload.name !== undefined) update.name = String(payload.name).trim();
  if (payload.usageType !== undefined) update.usageType = payload.usageType;
  if (payload.capacity !== undefined) update.capacity = Number(payload.capacity);
  if (payload.status !== undefined) update.status = payload.status;
  // Tầng hiệu lực sau cập nhật — dùng để validate loại xe theo tầng VÀ ngân sách.
  const needsFloor =
    payload.floor !== undefined ||
    payload.vehicleType !== undefined ||
    payload.capacity !== undefined;
  const effectiveFloor = needsFloor
    ? await ensureFloorBelongsToBuilding(payload.floor || current.floor, buildingId)
    : null;

  if (payload.floor !== undefined) update.floor = payload.floor;
  if (payload.vehicleType !== undefined) {
    await ensureVehicleTypeAllowedOnFloor(payload.vehicleType, buildingId, effectiveFloor);
    update.vehicleType = payload.vehicleType;
  }

  // Đổi capacity hoặc chuyển tầng → kiểm tra lại ngân sách của tầng hiệu lực.
  if (payload.capacity !== undefined || payload.floor !== undefined) {
    const effectiveCapacity =
      payload.capacity !== undefined ? Number(payload.capacity) : Number(current.capacity);
    assertValidZoneCapacity(effectiveCapacity);
    await assertZoneCapacityFitsFloor(effectiveFloor, effectiveCapacity, current._id);
  }

  const updated = await Zone.findByIdAndUpdate(id, update, {
    new: true,
    runValidators: true,
  });

  // Loại xe / đối tượng đổi → đẩy xuống slot để filter check-in luôn nhất quán.
  if (update.vehicleType !== undefined || update.usageType !== undefined) {
    await propagateToSlots(updated);
  }

  await writeAuditLog({
    actor: user,
    action: "UPDATE_ZONE",
    targetTable: "zones",
    targetId: id,
    building: buildingId,
    previousValue: current.toObject(),
    newValue: updated.toObject(),
  });
  return updated;
};

const remove = async (user, buildingId, id) => {
  ensureManagerOwnsBuilding(user, buildingId);
  const current = await Zone.findOne({ _id: id, building: buildingId });
  if (!current) throw new AppError("Zone not found", 404);

  const slotsCount = await ParkingSlot.countDocuments({ zone: id });
  if (slotsCount > 0) {
    throw new AppError("Zone still has parking slots. Remove slots first.", 409);
  }

  await Zone.deleteOne({ _id: id });
  await writeAuditLog({
    actor: user,
    action: "DELETE_ZONE",
    targetTable: "zones",
    targetId: id,
    building: buildingId,
    previousValue: current.toObject(),
    severity: "medium",
  });
  return { id };
};

module.exports = { list, create, update, remove, ensureFloorBelongsToBuilding };
