const VehicleType = require("../../models/building/VehicleType");
const PricePolicy = require("../../models/policy/PricePolicy");
const Floor = require("../../models/building/Floor");
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
    .replace(/[̀-ͯ]/g, "")
    .replace(/Đ/g, "D")
    .replace(/[^A-Z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .substring(0, 20);

const create = async (user, buildingId, payload) => {
  ensureManagerOwnsBuilding(user, buildingId);
  const code = payload.code
    ? String(payload.code).trim().toUpperCase()
    : generateCode(String(payload.name || ""));

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

  // Chặn xóa khi loại xe còn được tham chiếu — tránh để lại config/phiên mồ côi
  // (đồng bộ với floor.remove / gate.remove). Kiểm: bảng giá, tầng cho phép, phiên đang đỗ.
  const [pricePolicyCount, floorCount, activeSessionCount] = await Promise.all([
    PricePolicy.countDocuments({ building: buildingId, vehicleType: id }),
    Floor.countDocuments({ building: buildingId, allowedVehicleTypes: id }),
    ParkingSession.countDocuments({ building: buildingId, status: "active", vehicleType: id }),
  ]);
  if (pricePolicyCount > 0) {
    throw new AppError("Không thể xóa: loại xe đang được dùng trong bảng giá. Hãy gỡ/hủy bảng giá trước.", 409);
  }
  if (floorCount > 0) {
    throw new AppError("Không thể xóa: loại xe đang được cho phép ở một số tầng. Hãy bỏ khỏi tầng trước.", 409);
  }
  if (activeSessionCount > 0) {
    throw new AppError("Không thể xóa: còn xe thuộc loại này đang đỗ.", 409);
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

