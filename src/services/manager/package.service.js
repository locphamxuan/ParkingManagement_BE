const LongTermPackage = require("../../models/policy/LongTermPackage");
const logger = require("../../utils/logger");
const LongTermSubscription = require("../../models/policy/LongTermSubscription");
const ParkingSlot = require("../../models/building/ParkingSlot");
const Notification = require("../../models/log/Notification");
const User = require("../../models/user/User");
const AppError = require("../../utils/AppError");
const { ensureManagerOwnsBuilding } = require("../../utils/managerScope");
const { writeAuditLog } = require("../../utils/audit");
const { defaultMaxHoursByDuration } = require("../../utils/longTermUsage");
const { sendNotificationEmail } = require("../../utils/email");

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
    // Giờ/ngày: dùng giá trị manager nhập, nếu bỏ trống thì mặc định theo thời hạn
    // (tuần 5h, tháng 7h, năm 10h).
    maxHoursPerDay:
      payload.maxHoursPerDay !== undefined && payload.maxHoursPerDay !== null && payload.maxHoursPerDay !== ''
        ? Number(payload.maxHoursPerDay)
        : defaultMaxHoursByDuration(payload.durationDays),
    reservedSlots: payload.reservedSlots ? Number(payload.reservedSlots) : 0,
    description: payload.description || "",
    allowDedicatedSlot: payload.allowDedicatedSlot === true || payload.allowDedicatedSlot === 'true',
    benefits: Array.isArray(payload.benefits) ? payload.benefits.map(String) : [],
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
  ["durationDays", "price", "reservedSlots", "maxHoursPerDay"].forEach((k) => {
    if (payload[k] !== undefined) update[k] = Number(payload[k]);
  });
  if (payload.isActive !== undefined) update.isActive = !!payload.isActive;
  if (payload.allowDedicatedSlot !== undefined) {
    update.allowDedicatedSlot = payload.allowDedicatedSlot === true || payload.allowDedicatedSlot === 'true';
  }
  if (payload.benefits !== undefined) {
    update.benefits = Array.isArray(payload.benefits) ? payload.benefits.map(String) : [];
  }

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

/**
 * Manager chủ động thu hồi slot cố định của một subscription (vd giải quyết tranh
 * chấp, hoặc thu hồi sớm). Thả slot về 'available', đánh dấu slotReleased, ghi
 * audit và báo cho user. KHÔNG đổi trạng thái gói (không tự hủy).
 */
const releaseSubscriptionSlot = async (user, buildingId, subscriptionId) => {
  ensureManagerOwnsBuilding(user, buildingId);

  const sub = await LongTermSubscription.findOne({
    _id: subscriptionId,
    building: buildingId,
  }).populate("package", "name");
  if (!sub) throw new AppError("Subscription not found", 404);
  if (!sub.slot) throw new AppError("Gói này không có chỗ đỗ cố định để thu hồi", 400);
  if (sub.slotReleased) throw new AppError("Chỗ đỗ đã được thu hồi trước đó", 400);

  await ParkingSlot.findByIdAndUpdate(sub.slot, { status: "available" });
  await LongTermSubscription.updateOne({ _id: sub._id }, { $set: { slotReleased: true } });

  await writeAuditLog({
    actor: user,
    action: "MANAGER_RELEASE_SUBSCRIPTION_SLOT",
    targetTable: "long_term_subscriptions",
    targetId: sub._id,
    building: buildingId,
    previousValue: { slot: sub.slot, slotReleased: false },
    newValue: { slotReleased: true },
    severity: "medium",
  });

  const pkgName = sub.package?.name || "gói dài hạn";
  const message =
    `Chỗ đỗ cố định của gói "${pkgName}" (biển số ${sub.plateNumber}) đã được ban quản lý thu hồi. ` +
    `Bạn vẫn có thể đỗ xe theo lượt và mua gói mới bất cứ lúc nào.`;
  try {
    await Notification.create({
      user: sub.user,
      type: "subscription_slot_released",
      title: "Chỗ đỗ cố định đã được thu hồi",
      message,
      plateNumber: sub.plateNumber || null,
      building: buildingId,
    });
    const owner = await User.findById(sub.user).select("email fullName");
    if (owner?.email) {
      await sendNotificationEmail({
        to: owner.email,
        fullName: owner.fullName,
        subject: "Chỗ đỗ cố định đã được thu hồi",
        heading: "Chỗ đỗ cố định đã được thu hồi",
        bodyHtml: `<p>${message}</p>`,
      });
    }
  } catch (err) {
    logger.error("[package.releaseSubscriptionSlot] notify failed:", err.message);
  }

  return sub;
};

module.exports = {
  listPackages,
  createPackage,
  updatePackage,
  removePackage,
  listSubscriptions,
  releaseSubscriptionSlot,
};

