const LongTermPackage = require("../../models/policy/LongTermPackage");
const LongTermSubscription = require("../../models/policy/LongTermSubscription");
const AppError = require("../../utils/AppError");
const { ensureManagerOwnsBuilding } = require("../../utils/managerScope");
const { writeAuditLog } = require("../../utils/audit");

const listPackages = async (user, buildingId, query = {}) => {
  ensureManagerOwnsBuilding(user, buildingId);
  const filter = { building: buildingId };
  if (query.isActive !== undefined) {
    filter.isActive = query.isActive === "true" || query.isActive === true;
  }
  return LongTermPackage.find(filter)
    .populate("vehicleType", "code name")
    .sort("-createdAt");
};

const createPackage = async (user, buildingId, payload) => {
  ensureManagerOwnsBuilding(user, buildingId);
  if (!payload.vehicleType) throw new AppError("vehicleType is required", 400);
  const created = await LongTermPackage.create({
    building: buildingId,
    vehicleType: payload.vehicleType,
    name: String(payload.name || "").trim(),
    code: String(payload.code || "").trim().toUpperCase(),
    durationDays: Number(payload.durationDays),
    price: Number(payload.price),
    reservedSlots: payload.reservedSlots
      ? Number(payload.reservedSlots)
      : 0,
    description: payload.description || "",
    isActive: payload.isActive !== false,
  });
  await writeAuditLog({
    actor: user,
    action: "CREATE_LONG_TERM_PACKAGE",
    targetTable: "long_term_packages",
    targetId: created._id,
    building: buildingId,
    newValue: created.toObject(),
  });
  return created;
};

const updatePackage = async (user, buildingId, id, payload) => {
  ensureManagerOwnsBuilding(user, buildingId);
  const current = await LongTermPackage.findOne({
    _id: id,
    building: buildingId,
  });
  if (!current) throw new AppError("Package not found", 404);

  const update = {};
  ["name", "description", "vehicleType"].forEach((k) => {
    if (payload[k] !== undefined) update[k] = payload[k];
  });
  if (payload.code !== undefined)
    update.code = String(payload.code).trim().toUpperCase();
  ["durationDays", "price", "reservedSlots"].forEach((k) => {
    if (payload[k] !== undefined) update[k] = Number(payload[k]);
  });
  if (payload.isActive !== undefined) update.isActive = !!payload.isActive;

  const updated = await LongTermPackage.findByIdAndUpdate(id, update, {
    new: true,
    runValidators: true,
  });
  await writeAuditLog({
    actor: user,
    action: "UPDATE_LONG_TERM_PACKAGE",
    targetTable: "long_term_packages",
    targetId: id,
    building: buildingId,
    previousValue: current.toObject(),
    newValue: updated.toObject(),
  });
  return updated;
};

const removePackage = async (user, buildingId, id) => {
  ensureManagerOwnsBuilding(user, buildingId);
  const current = await LongTermPackage.findOne({
    _id: id,
    building: buildingId,
  });
  if (!current) throw new AppError("Package not found", 404);

  const subs = await LongTermSubscription.countDocuments({
    package: id,
    status: { $in: ["active", "pending"] },
  });
  if (subs > 0) {
    throw new AppError(
      "Package has active subscriptions. Deactivate instead.",
      409
    );
  }

  await LongTermPackage.deleteOne({ _id: id });
  await writeAuditLog({
    actor: user,
    action: "DELETE_LONG_TERM_PACKAGE",
    targetTable: "long_term_packages",
    targetId: id,
    building: buildingId,
    previousValue: current.toObject(),
    severity: "medium",
  });
  return { id };
};

const listSubscriptions = async (user, buildingId, query = {}) => {
  ensureManagerOwnsBuilding(user, buildingId);
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);

  const filter = { building: buildingId };
  if (query.status) filter.status = query.status;
  if (query.plate)
    filter.plateNumber = String(query.plate).trim().toUpperCase();

  const [items, total] = await Promise.all([
    LongTermSubscription.find(filter)
      .populate("user", "fullName email phone")
      .populate("package", "name code durationDays price")
      .sort("-createdAt")
      .skip((page - 1) * limit)
      .limit(limit),
    LongTermSubscription.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

module.exports = {
  listPackages,
  createPackage,
  updatePackage,
  removePackage,
  listSubscriptions,
};

