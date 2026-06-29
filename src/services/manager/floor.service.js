const Floor = require("../../models/building/Floor");
const ParkingSlot = require("../../models/building/ParkingSlot");
const Zone = require("../../models/building/Zone");
const AppError = require("../../utils/AppError");
const { ensureManagerOwnsBuilding } = require("../../utils/managerScope");
const { writeAuditLog } = require("../../utils/audit");

const list = async (user, buildingId) => {
  ensureManagerOwnsBuilding(user, buildingId);
  return Floor.find({ building: buildingId })
    .populate("allowedVehicleTypes", "code name")
    .sort("code");
};

const getById = async (user, buildingId, id) => {
  ensureManagerOwnsBuilding(user, buildingId);
  const floor = await Floor.findOne({ _id: id, building: buildingId }).populate(
    "allowedVehicleTypes",
    "code name"
  );
  if (!floor) throw new AppError("Floor not found", 404);
  return floor;
};

const create = async (user, buildingId, payload) => {
  ensureManagerOwnsBuilding(user, buildingId);
  const created = await Floor.create({
    building: buildingId,
    code: String(payload.code || "").trim().toUpperCase(),
    capacity: Number(payload.capacity ?? 0),
    allowedVehicleTypes: Array.isArray(payload.allowedVehicleTypes)
      ? payload.allowedVehicleTypes
      : [],
    status: payload.status || "active",
  });
  await writeAuditLog({
    actor: user,
    action: "CREATE_FLOOR",
    targetTable: "floors",
    targetId: created._id,
    building: buildingId,
    newValue: created.toObject(),
  });
  return created;
};

const update = async (user, buildingId, id, payload) => {
  ensureManagerOwnsBuilding(user, buildingId);
  const current = await Floor.findOne({ _id: id, building: buildingId });
  if (!current) throw new AppError("Floor not found", 404);

  const update = {};
  ["status"].forEach((k) => {
    if (payload[k] !== undefined) update[k] = payload[k];
  });
  if (payload.code !== undefined)
    update.code = String(payload.code).trim().toUpperCase();
  if (payload.levelNumber !== undefined)
    update.levelNumber = Number(payload.levelNumber);
  if (payload.capacity !== undefined) update.capacity = Number(payload.capacity);
  if (Array.isArray(payload.allowedVehicleTypes))
    update.allowedVehicleTypes = payload.allowedVehicleTypes;

  // Giảm capacity tầng không được xuống dưới TỔNG capacity các dãy hiện có, cũng không
  // dưới SỐ SLOT đã tạo — nếu không sẽ phá vỡ ràng buộc slot ≤ dãy ≤ tổng ≤ tầng.
  if (update.capacity !== undefined && update.capacity > 0) {
    const [zoneAgg, slotCount] = await Promise.all([
      Zone.aggregate([
        { $match: { floor: current._id } },
        { $group: { _id: null, total: { $sum: "$capacity" } } },
      ]),
      ParkingSlot.countDocuments({ floor: current._id }),
    ]);
    const zoneTotal = zoneAgg[0]?.total || 0;
    if (update.capacity < zoneTotal) {
      throw new AppError(
        `Floor capacity (${update.capacity}) is below the total zone capacity (${zoneTotal}). Reduce zone capacities first.`,
        409,
        "FLOOR_CAPACITY_BELOW_ZONES",
      );
    }
    if (update.capacity < slotCount) {
      throw new AppError(
        `Floor capacity (${update.capacity}) is below the current slot count (${slotCount}). Remove slots first.`,
        409,
        "FLOOR_CAPACITY_BELOW_SLOTS",
      );
    }
  }

  const updated = await Floor.findByIdAndUpdate(id, update, {
    new: true,
    runValidators: true,
  });
  await writeAuditLog({
    actor: user,
    action: "UPDATE_FLOOR",
    targetTable: "floors",
    targetId: id,
    building: buildingId,
    previousValue: current.toObject(),
    newValue: updated.toObject(),
  });
  return updated;
};

const remove = async (user, buildingId, id) => {
  ensureManagerOwnsBuilding(user, buildingId);
  const current = await Floor.findOne({ _id: id, building: buildingId });
  if (!current) throw new AppError("Floor not found", 404);

  const slotsCount = await ParkingSlot.countDocuments({ floor: id });
  if (slotsCount > 0) {
    throw new AppError(
      "Floor still has parking slots. Remove slots first.",
      409
    );
  }

  // Zones belong to a floor — block delete while any remain to avoid orphaned zones.
  const zonesCount = await Zone.countDocuments({ floor: id });
  if (zonesCount > 0) {
    throw new AppError(
      "Floor still has zones. Remove zones first.",
      409
    );
  }

  await Floor.deleteOne({ _id: id });
  await writeAuditLog({
    actor: user,
    action: "DELETE_FLOOR",
    targetTable: "floors",
    targetId: id,
    building: buildingId,
    previousValue: current.toObject(),
    severity: "medium",
  });
  return { id };
};

module.exports = { list, getById, create, update, remove };

