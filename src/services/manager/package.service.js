const mongoose = require("mongoose");
const LongTermPackage = require("../../models/policy/LongTermPackage");
const LongTermSubscription = require("../../models/policy/LongTermSubscription");
const { getRefundPercent } = require("../../utils/refundPolicy");
const WalletTransaction = require("../../models/finance/WalletTransaction");
const Payment = require("../../models/finance/Payment");
const User = require("../../models/user/User");
const Notification = require("../../models/log/Notification");
const AppError = require("../../utils/AppError");
const { ensureManagerOwnsBuilding } = require("../../utils/managerScope");
const { writeAuditLog } = require("../../utils/audit");
const { defaultMaxHoursByDuration } = require("../../utils/longTermUsage");
const buildingWalletService = require("./buildingWallet.service");

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
    description: payload.description || "",
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
  ["durationDays", "price", "maxHoursPerDay"].forEach((k) => {
    if (payload[k] !== undefined) update[k] = Number(payload[k]);
  });
  if (payload.isActive !== undefined) update.isActive = !!payload.isActive;
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
    status: 'active',
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

const cancelSubscription = async (managerUser, buildingId, subscriptionId, reason) => {
  ensureManagerOwnsBuilding(managerUser, buildingId);

  const mongoSession = await mongoose.startSession();
  try {
    let result;
    await mongoSession.withTransaction(async () => {
      const subscription = await LongTermSubscription.findOne({
        _id: subscriptionId,
        building: buildingId,
      })
        .populate("package")
        .session(mongoSession);

      if (!subscription) throw new AppError("Không tìm thấy gói đăng ký", 404);
      if (subscription.status === "cancelled") throw new AppError("Gói đăng ký đã được hủy trước đó", 400);
      if (subscription.status !== "active") {
        throw new AppError("Chỉ được phép hủy gói đang hoạt động (active)", 400);
      }

      const packagePrice = subscription.package?.price ?? 0;
      // % hoàn tiền do MANAGER cấu hình — helper chung (default 80, clamp 0–100),
      // đồng bộ với luồng user tự hủy (longTerm.service.js).
      const refundPercent = await getRefundPercent(buildingId, mongoSession);
      const refundAmount = Math.round((packagePrice * refundPercent) / 100);

      subscription.status = "cancelled";
      subscription.cancelReason = "manager_cancelled";
      subscription.cancelNote = reason || "Hủy bởi quản lý";
      subscription.refundPercent = refundPercent;
      subscription.refundAmount = refundAmount;
      await subscription.save({ session: mongoSession });

      if (subscription.user) {
        const updatedUser = await User.findByIdAndUpdate(
          subscription.user,
          { $inc: { walletBalance: refundAmount } },
          { new: true, session: mongoSession }
        ).select("walletBalance");

        if (updatedUser) {
          await WalletTransaction.create(
            [{
              user: subscription.user,
              type: "refund",
              amount: refundAmount,
              balanceAfter: updatedUser.walletBalance,
              status: "success",
              reason: "long_term_subscription_cancellation",
              metadata: {
                subscriptionId: subscription._id,
                cancelReason: "manager_cancelled",
                refundAmount,
                refundPercent,
                originalPrice: packagePrice,
                cancelledByManager: managerUser._id,
              },
            }],
            { session: mongoSession }
          );
        }

        if (refundAmount > 0) {
          const [refundPayment] = await Payment.create(
            [{
              building: buildingId,
              subscription: subscription._id,
              type: "refund",
              method: "wallet",
              amount: refundAmount,
              status: "success",
              user: subscription.user,
              note: `Subscription ${subscription._id} cancelled by manager — ${refundPercent}% refund`,
            }],
            { session: mongoSession }
          );
          await buildingWalletService.debit(
            buildingId, refundAmount, "refund", refundPayment._id, null, mongoSession, { allowNegative: true }
          );
        }

        try {
          await Notification.create([{
            user: subscription.user,
            type: 'subscription_cancelled',
            title: 'Gói dài hạn bị hủy bởi quản lý',
            message: `Gói "${subscription.package?.name || 'dài hạn'}" (biển số ${subscription.plateNumber}) của bạn đã bị hủy bởi quản lý. Số tiền hoàn lại: ${refundAmount.toLocaleString('vi-VN')} VND (${refundPercent}% giá trị gói).`,
            building: buildingId,
          }], { session: mongoSession });
        } catch (e) {
          // Notification không được block transaction
        }
      }

      await writeAuditLog({
        actor: managerUser,
        action: "MANAGER_CANCEL_SUBSCRIPTION",
        targetTable: "long_term_subscriptions",
        targetId: subscription._id,
        building: buildingId,
        metadata: { refundAmount, refundPercent, originalPrice: packagePrice },
        severity: "medium",
      });

      result = { subscription, refundAmount, refundPercent };
    });
    return result;
  } finally {
    await mongoSession.endSession();
  }
};

module.exports = {
  listPackages,
  createPackage,
  updatePackage,
  removePackage,
  listSubscriptions,
  cancelSubscription,
};

