const PricePolicy = require("../../models/policy/PricePolicy");
const VehicleType = require("../../models/building/VehicleType");
const AppError = require("../../utils/AppError");
const { ensureManagerOwnsBuilding } = require("../../utils/managerScope");
const { writeAuditLog } = require("../../utils/audit");

// Trùng lặp bảng giá được xử lý ở tầng MODEL: PricePolicy.pre('save') tự deactivate
// các policy cùng (building, vehicleType, type) đang active khi tạo/bật policy mới.
// Vì vậy service KHÔNG chặn conflict nữa (tránh mâu thuẫn với hook auto-deactivate).

const assertValidRate = (rate) => {
  if (Number.isNaN(rate) || rate < 0) {
    throw new AppError("hourlyRate must be a non-negative number", 400);
  }
};

const assertValidEffectiveRange = (from, to) => {
  if (to && from && new Date(to).getTime() <= new Date(from).getTime()) {
    throw new AppError("effectiveTo must be after effectiveFrom", 400);
  }
};

const list = async (user, buildingId, query = {}) => {
  ensureManagerOwnsBuilding(user, buildingId);
  const filter = { building: buildingId };
  if (query.isActive !== undefined) {
    filter.isActive = query.isActive === "true" || query.isActive === true;
  }
  if (query.vehicleType) filter.vehicleType = query.vehicleType;
  return PricePolicy.find(filter)
    .populate("vehicleType", "code name")
    .sort("-effectiveFrom");
};

const writeLog = async (user, buildingId, policy, action, previousValue, newValue) => {
  await writeAuditLog({
    actor: user,
    action: `${action.toUpperCase()}_PRICE_POLICY`,
    targetTable: "price_policies",
    targetId: policy._id,
    building: buildingId,
    previousValue,
    newValue,
    severity: "medium",
  });
};

const create = async (user, buildingId, payload) => {
  ensureManagerOwnsBuilding(user, buildingId);
  if (!payload.vehicleType) throw new AppError("vehicleType is required", 400);

  // Loại xe phải thuộc tòa nhà (tránh tham chiếu chéo tòa nhà).
  const vtExists = await VehicleType.exists({ _id: payload.vehicleType, building: buildingId });
  if (!vtExists) throw new AppError("Vehicle type not found in this building", 404);

  const type = payload.type === 'peak' ? 'peak' : 'regular';
  const hourlyRate = Number(payload.hourlyRate);
  const effectiveFrom = payload.effectiveFrom || new Date();
  const effectiveTo = payload.effectiveTo || null;
  assertValidRate(hourlyRate);
  assertValidEffectiveRange(effectiveFrom, effectiveTo);

  const created = await PricePolicy.create({
    building: buildingId,
    vehicleType: payload.vehicleType,
    name: String(payload.name || "").trim(),
    type,
    hourlyRate,
    timeWindow: payload.timeWindow || undefined,
    effectiveFrom,
    effectiveTo,
    isActive: payload.isActive !== false,
  });
  await writeLog(user, buildingId, created, "create", null, created.toObject());
  return created;
};

const update = async (user, buildingId, id, payload) => {
  ensureManagerOwnsBuilding(user, buildingId);
  const current = await PricePolicy.findOne({ _id: id, building: buildingId });
  if (!current) throw new AppError("Price policy not found", 404);

  const update = {};
  ["name", "vehicleType", "type", "timeWindow", "effectiveFrom", "effectiveTo"].forEach((k) => {
    if (payload[k] !== undefined) update[k] = payload[k];
  });
  if (payload.type !== undefined) update.type = payload.type === 'peak' ? 'peak' : 'regular';
  if (payload.hourlyRate !== undefined) update.hourlyRate = Number(payload.hourlyRate);
  if (payload.isActive !== undefined) update.isActive = !!payload.isActive;

  if (payload.vehicleType !== undefined) {
    const vtExists = await VehicleType.exists({ _id: payload.vehicleType, building: buildingId });
    if (!vtExists) throw new AppError("Vehicle type not found in this building", 404);
  }
  if (update.hourlyRate !== undefined) assertValidRate(update.hourlyRate);

  // Giá trị hiệu lực sau cập nhật (gộp current + payload) để kiểm tra khoảng ngày.
  const effFrom = update.effectiveFrom ?? current.effectiveFrom;
  const effTo = update.effectiveTo !== undefined ? update.effectiveTo : current.effectiveTo;
  assertValidEffectiveRange(effFrom, effTo);

  const updated = await PricePolicy.findByIdAndUpdate(id, update, {
    new: true,
    runValidators: true,
  });
  await writeLog(
    user,
    buildingId,
    updated,
    "update",
    current.toObject(),
    updated.toObject()
  );
  return updated;
};

const deactivate = async (user, buildingId, id) => {
  ensureManagerOwnsBuilding(user, buildingId);
  const current = await PricePolicy.findOne({ _id: id, building: buildingId });
  if (!current) throw new AppError("Price policy not found", 404);

  const updated = await PricePolicy.findByIdAndUpdate(
    id,
    { isActive: false },
    { new: true }
  );
  await writeLog(
    user,
    buildingId,
    updated,
    "deactivate",
    current.toObject(),
    updated.toObject()
  );
  return updated;
};

module.exports = { list, create, update, deactivate };

