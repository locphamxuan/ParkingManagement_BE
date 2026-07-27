const VehicleType = require("../../models/building/VehicleType");
const PricePolicy = require("../../models/policy/PricePolicy");
const Floor = require("../../models/building/Floor");
const Zone = require("../../models/building/Zone");
const ParkingSession = require("../../models/operations/ParkingSession");
const AppError = require("../../utils/AppError");
const { ensureManagerOwnsBuilding } = require("../../utils/managerScope");
const { writeAuditLog } = require("../../utils/audit");

const list = async (user, buildingId, query = {}) => {
  ensureManagerOwnsBuilding(user, buildingId);
  const filter = { building: buildingId };
  if (query.isActive !== undefined) {
    filter.isActive = query.isActive === "true" || query.isActive === true;
  }
  return VehicleType.find(filter).sort("code");
};

const generateCode = (name) =>
  name
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replaceAll(/[̀-ͯ]/g, "")
    .replaceAll(/Đ/g, "D")
    .replaceAll(/[^A-Z0-9]/g, "_")
    .replaceAll(/_+/g, "_")
    .replaceAll(/^_|_$/g, "")
    .substring(0, 20);

const create = async (user, buildingId, payload) => {
  ensureManagerOwnsBuilding(user, buildingId);
  const code = payload.code
    ? String(payload.code).trim().toUpperCase()
    : generateCode(String(payload.name || ""));

  // Báo lỗi 409 rõ ràng thay vì để unique index ném lỗi Mongo thô.
  const duplicate = await VehicleType.findOne({ building: buildingId, code });
  if (duplicate) {
    throw new AppError("Vehicle type code already exists in this building", 409, "DUPLICATE_VEHICLE_TYPE_CODE");
  }

  const created = await VehicleType.create({
    building: buildingId,
    code,
    name: String(payload.name || "").trim(),
    description: payload.description || "",
    isActive: payload.isActive !== false,
  });
  await writeAuditLog({
    actor: user,
    action: "CREATE_VEHICLE_TYPE",
    targetTable: "vehicle_types",
    targetId: created._id,
    building: buildingId,
    newValue: created.toObject(),
  });
  return created;
};

const update = async (user, buildingId, id, payload) => {
  ensureManagerOwnsBuilding(user, buildingId);
  const current = await VehicleType.findOne({ _id: id, building: buildingId });
  if (!current) throw new AppError("VehicleType not found", 404);

  const update = {};
  if (payload.name !== undefined) update.name = String(payload.name).trim();
  if (payload.code !== undefined)
    update.code = String(payload.code).trim().toUpperCase();
  if (payload.description !== undefined) update.description = payload.description;
  if (payload.isActive !== undefined) update.isActive = !!payload.isActive;

  // Đổi code → kiểm tra trùng trong tòa nhà (loại trừ chính nó) để báo 409 rõ ràng.
  if (update.code !== undefined && update.code !== current.code) {
    const duplicate = await VehicleType.findOne({
      building: buildingId,
      code: update.code,
      _id: { $ne: id },
    });
    if (duplicate) {
      throw new AppError("Vehicle type code already exists in this building", 409, "DUPLICATE_VEHICLE_TYPE_CODE");
    }
  }

  const updated = await VehicleType.findByIdAndUpdate(id, update, {
    new: true,
    runValidators: true,
  });
  await writeAuditLog({
    actor: user,
    action: "UPDATE_VEHICLE_TYPE",
    targetTable: "vehicle_types",
    targetId: id,
    building: buildingId,
    previousValue: current.toObject(),
    newValue: updated.toObject(),
  });
  return updated;
};

const remove = async (user, buildingId, id) => {
  ensureManagerOwnsBuilding(user, buildingId);
  const current = await VehicleType.findOne({ _id: id, building: buildingId });
  if (!current) throw new AppError("VehicleType not found", 404);

  // Block delete while the vehicle type is still referenced — avoids orphaned config /
  // sessions (mirrors floor.remove / gate.remove). Check: price policies, floor allow-list,
  // zones, and active parking sessions.
  const [pricePolicyCount, floorCount, zoneCount, activeSessionCount] = await Promise.all([
    PricePolicy.countDocuments({ building: buildingId, vehicleType: id }),
    Floor.countDocuments({ building: buildingId, allowedVehicleTypes: id }),
    Zone.countDocuments({ building: buildingId, vehicleType: id }),
    ParkingSession.countDocuments({ building: buildingId, status: "active", vehicleType: id }),
  ]);
  if (pricePolicyCount > 0) {
    throw new AppError("Cannot delete: the vehicle type is used by a price policy. Remove/deactivate the price policy first.", 409);
  }
  if (floorCount > 0) {
    throw new AppError("Cannot delete: the vehicle type is allowed on some floors. Remove it from those floors first.", 409);
  }
  if (zoneCount > 0) {
    throw new AppError("Cannot delete: the vehicle type is used by one or more zones. Change or remove those zones first.", 409);
  }
  if (activeSessionCount > 0) {
    throw new AppError("Cannot delete: vehicles of this type are still parked.", 409);
  }

  await VehicleType.deleteOne({ _id: id });
  await writeAuditLog({
    actor: user,
    action: "DELETE_VEHICLE_TYPE",
    targetTable: "vehicle_types",
    targetId: id,
    building: buildingId,
    previousValue: current.toObject(),
    severity: "medium",
  });
  return { id };
};

module.exports = { list, create, update, remove };

