const Gate = require("../../models/building/Gate");
const AppError = require("../../utils/AppError");
const { ensureManagerOwnsBuilding } = require("../../utils/managerScope");
const { writeAuditLog } = require("../../utils/audit");

const list = async (user, buildingId) => {
  ensureManagerOwnsBuilding(user, buildingId);
  return Gate.find({ building: buildingId })
    .populate("allowedVehicleTypes", "code name")
    .populate("floors", "code name levelNumber")
    .sort("code");
};

const create = async (user, buildingId, payload) => {
  ensureManagerOwnsBuilding(user, buildingId);
  const created = await Gate.create({
    building: buildingId,
    code: String(payload.code || "").trim().toUpperCase(),
    name: String(payload.name || "").trim(),
    direction: payload.direction || "both",
    allowedVehicleTypes: Array.isArray(payload.allowedVehicleTypes)
      ? payload.allowedVehicleTypes
      : [],
    floors: Array.isArray(payload.floors) ? payload.floors : [],
    status: payload.status || "active",
  });
  await writeAuditLog({
    actor: user,
    action: "CREATE_GATE",
    targetTable: "gates",
    targetId: created._id,
    building: buildingId,
    newValue: created.toObject(),
  });
  return created;
};

const update = async (user, buildingId, id, payload) => {
  ensureManagerOwnsBuilding(user, buildingId);
  const current = await Gate.findOne({ _id: id, building: buildingId });
  if (!current) throw new AppError("Gate not found", 404);

  const update = {};
  ["name", "direction", "status"].forEach((k) => {
    if (payload[k] !== undefined) update[k] = payload[k];
  });
  if (payload.code !== undefined)
    update.code = String(payload.code).trim().toUpperCase();
  if (Array.isArray(payload.allowedVehicleTypes))
    update.allowedVehicleTypes = payload.allowedVehicleTypes;
  if (Array.isArray(payload.floors))
    update.floors = payload.floors;

  const updated = await Gate.findByIdAndUpdate(id, update, {
    new: true,
    runValidators: true,
  });
  await writeAuditLog({
    actor: user,
    action: "UPDATE_GATE",
    targetTable: "gates",
    targetId: id,
    building: buildingId,
    previousValue: current.toObject(),
    newValue: updated.toObject(),
  });
  return updated;
};

const remove = async (user, buildingId, id) => {
  ensureManagerOwnsBuilding(user, buildingId);
  const current = await Gate.findOne({ _id: id, building: buildingId });
  if (!current) throw new AppError("Gate not found", 404);
  await Gate.deleteOne({ _id: id });
  await writeAuditLog({
    actor: user,
    action: "DELETE_GATE",
    targetTable: "gates",
    targetId: id,
    building: buildingId,
    previousValue: current.toObject(),
    severity: "medium",
  });
  return { id };
};

module.exports = { list, create, update, remove };

