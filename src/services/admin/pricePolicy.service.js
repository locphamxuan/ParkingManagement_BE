const PricePolicy = require("../../models/policy/PricePolicy");
const PolicyPushLog = require("../../models/policy/PolicyPushLog");
const Building = require("../../models/building/Building");
const VehicleType = require("../../models/building/VehicleType");
const AppError = require("../../utils/AppError");
const { writeAuditLog } = require("../../utils/audit");

const list = async (query = {}) => {
  const filter = {};
  if (query.buildingId) filter.building = query.buildingId;
  if (query.isActive !== undefined)
    filter.isActive = query.isActive === "true" || query.isActive === true;

  return PricePolicy.find(filter)
    .populate("building", "name code")
    .populate("vehicleType", "code name")
    .sort("-effectiveFrom");
};

const push = async ({ buildingId, vehicleTypeId, payload, actor }) => {
  if (!buildingId) throw new AppError("buildingId is required", 400);
  if (!vehicleTypeId) throw new AppError("vehicleTypeId is required", 400);
  if (!payload.hourlyRate) throw new AppError("hourlyRate is required", 400);

  const [buildingExists, vehicleTypeExists] = await Promise.all([
    Building.exists({ _id: buildingId }),
    VehicleType.exists({ _id: vehicleTypeId }),
  ]);
  if (!buildingExists) throw new AppError("Building not found", 404);
  if (!vehicleTypeExists) throw new AppError("VehicleType not found", 404);

  // Deactivate existing active policy for same building + vehicleType
  const existing = await PricePolicy.findOne({
    building: buildingId,
    vehicleType: vehicleTypeId,
    isActive: true,
  });

  if (existing) {
    const prev = existing.toObject();
    existing.isActive = false;
    await existing.save();
    await PolicyPushLog.create({
      building: buildingId,
      pricePolicy: existing._id,
      actor: actor._id,
      action: "deactivate",
      previousValue: prev,
      newValue: { isActive: false },
    });
  }

  const created = await PricePolicy.create({
    building: buildingId,
    vehicleType: vehicleTypeId,
    name: String(payload.name || "").trim(),
    hourlyRate: Number(payload.hourlyRate),
    dailyCap: payload.dailyCap != null ? Number(payload.dailyCap) : null,
    minRate: payload.minRate != null ? Number(payload.minRate) : 0,
    maxRate: payload.maxRate != null ? Number(payload.maxRate) : null,
    timeWindow: payload.timeWindow || undefined,
    effectiveFrom: payload.effectiveFrom || new Date(),
    effectiveTo: payload.effectiveTo || null,
    isActive: true,
  });

  await PolicyPushLog.create({
    building: buildingId,
    pricePolicy: created._id,
    actor: actor._id,
    action: "push",
    previousValue: existing ? existing.toObject() : null,
    newValue: created.toObject(),
  });

  await writeAuditLog({
    actor,
    action: "PUSH_PRICE_POLICY",
    targetTable: "price_policies",
    targetId: created._id,
    building: buildingId,
    newValue: { buildingId, vehicleTypeId, hourlyRate: created.hourlyRate },
    severity: "medium",
  });

  return created;
};

const listPushLogs = async (query = {}) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);

  const filter = {};
  if (query.buildingId) filter.building = query.buildingId;
  if (query.action) filter.action = query.action;

  const [items, total] = await Promise.all([
    PolicyPushLog.find(filter)
      .populate("actor", "fullName email role")
      .populate("building", "name code")
      .populate("pricePolicy", "name")
      .sort("-createdAt")
      .skip((page - 1) * limit)
      .limit(limit),
    PolicyPushLog.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

module.exports = { list, push, listPushLogs };
