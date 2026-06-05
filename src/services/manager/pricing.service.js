const PricePolicy = require("../../models/policy/PricePolicy");
const AppError = require("../../utils/AppError");
const { ensureManagerOwnsBuilding } = require("../../utils/managerScope");
const { writeAuditLog } = require("../../utils/audit");

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

  const created = await PricePolicy.create({
    building: buildingId,
    vehicleType: payload.vehicleType,
    name: String(payload.name || "").trim(),
    type: payload.type || 'regular',
    hourlyRate: Number(payload.hourlyRate),
    dailyCap: payload.dailyCap !== undefined ? Number(payload.dailyCap) : null,
    minRate: payload.minRate !== undefined ? Number(payload.minRate) : 0,
    maxRate: payload.maxRate !== undefined ? Number(payload.maxRate) : null,
    timeWindow: payload.timeWindow || undefined,
    holidayDates: payload.holidayDates || [],
    effectiveFrom: payload.effectiveFrom || new Date(),
    effectiveTo: payload.effectiveTo || null,
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
  [
    "name",
    "vehicleType",
    "type",
    "timeWindow",
    "holidayDates",
    "effectiveFrom",
    "effectiveTo",
  ].forEach((k) => {
    if (payload[k] !== undefined) update[k] = payload[k];
  });
  ["hourlyRate", "dailyCap", "minRate", "maxRate"].forEach((k) => {
    if (payload[k] !== undefined)
      update[k] = payload[k] === null ? null : Number(payload[k]);
  });
  if (payload.isActive !== undefined) update.isActive = !!payload.isActive;

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

