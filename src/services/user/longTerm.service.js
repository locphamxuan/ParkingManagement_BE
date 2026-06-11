const LongTermPackage = require('../../models/policy/LongTermPackage');
const logger = require("../../utils/logger");
const LongTermSubscription = require('../../models/policy/LongTermSubscription');
const ParkingSlot = require('../../models/building/ParkingSlot');
const WalletTransaction = require('../../models/finance/WalletTransaction');
const User = require('../../models/user/User');
const AppError = require('../../utils/AppError');
const mongoose = require('mongoose');
const { normalizePlate } = require('../../utils/plate.util');

const Building = require('../../models/building/Building');

const listPackages = async (buildingId) => {
  // Nếu có buildingId → trả gói của building đó
  // Nếu không → trả tất cả gói đang active của tất cả buildings (để user browse)
  const filter = { isActive: true };
  if (buildingId) filter.building = buildingId;

  const packages = await LongTermPackage.find(filter)
    .populate('vehicleType', 'name code')
    .populate('building', 'name code address')
    .sort('-createdAt');
  return packages;
};

/**
 * Validate that the requested startDate falls within the allowed advance
 * booking window based on the package's durationDays.
 */
function validateStartDateConstraint(startDate, durationDays) {
  const now = new Date();

  if (durationDays <= 7) {
    // Weekly: startDate must be within 7 days from now
    const maxDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    if (startDate > maxDate) {
      throw new AppError('Gói tuần chỉ được đăng ký bắt đầu trong vòng 7 ngày tới', 400);
    }
  } else if (durationDays <= 30) {
    // Monthly: startDate must be within the current month or the next calendar month
    const endOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59, 999);
    if (startDate > endOfNextMonth) {
      throw new AppError('Gói tháng chỉ được đăng ký bắt đầu trong tháng này hoặc tháng sau', 400);
    }
  } else {
    // Yearly: startDate must be within the current calendar year or the next calendar year
    const endOfNextYear = new Date(now.getFullYear() + 1, 11, 31, 23, 59, 59, 999);
    if (startDate > endOfNextYear) {
      throw new AppError('Gói năm chỉ được đăng ký bắt đầu trong năm nay hoặc năm sau', 400);
    }
  }

  // startDate should not be before today (allow today and future dates)
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  if (startDate < todayStart) {
    throw new AppError('Ngày bắt đầu không được nằm trong quá khứ', 400);
  }
}

const subscribe = async (userId, { packageId, plateNumber, slotId, startDate }) => {
  // Chuẩn hoá biển số về dạng canonical (giống lúc check-in) để gói luôn được
  // nhận diện khi staff quét xe — tránh lệch '59G2-81000' vs '59G2-810.00'.
  const normalizedPlate = normalizePlate(plateNumber);
  if (!normalizedPlate) {
    throw new AppError('Biển số xe không hợp lệ', 400);
  }

  // Kiểm tra xem biển số này đã đăng ký gói dài hạn nào đang hoạt động hoặc chờ thanh toán chưa
  const existingActiveSub = await LongTermSubscription.findOne({
    plateNumber: normalizedPlate,
    status: { $in: ['pending', 'active'] }
  });

  if (existingActiveSub) {
    throw new AppError('Biển số xe này đã đăng ký một gói dài hạn khác đang hoạt động hoặc chờ thanh toán', 400);
  }

  const pkg = await LongTermPackage.findById(packageId);
  if (!pkg || !pkg.isActive) throw new AppError('Package not found or inactive', 404);

  // ── Determine start/end dates ────────────────────────────────────────────
  const resolvedStart = startDate ? new Date(startDate) : new Date();
  if (Number.isNaN(resolvedStart.getTime())) {
    throw new AppError('startDate is not a valid date', 400);
  }

  // Validate advance booking date constraint
  validateStartDateConstraint(resolvedStart, pkg.durationDays);

  const endDate = new Date(resolvedStart.getTime() + pkg.durationDays * 24 * 60 * 60 * 1000);

  // ── Dedicated slot handling ──────────────────────────────────────────────
  let resolvedSlotId = null;

  if (slotId) {
    // Gói phải cho phép chỗ đỗ cố định mới được chọn slot.
    if (!pkg.allowDedicatedSlot) {
      throw new AppError('Gói này không hỗ trợ chỗ đỗ cố định', 400);
    }

    // Verify the slot exists, is in the same building, matches vehicle type, and is available
    const slot = await ParkingSlot.findById(slotId).populate('vehicleType', 'code');
    if (!slot) {
      throw new AppError('Không tìm thấy chỗ đỗ', 404);
    }
    if (String(slot.building) !== String(pkg.building)) {
      throw new AppError('Chỗ đỗ không thuộc cùng tòa nhà với gói đăng ký', 400);
    }
    if (slot.vehicleType && String(slot.vehicleType._id || slot.vehicleType) !== String(pkg.vehicleType)) {
      throw new AppError('Loại xe của chỗ đỗ không khớp với gói đăng ký', 400);
    }
    if (slot.status !== 'available') {
      throw new AppError('Chỗ đỗ hiện không khả dụng', 409);
    }

    resolvedSlotId = slot._id;
  }

  // ── Debit wallet ─────────────────────────────────────────────────────────
  const updatedUser = await User.findOneAndUpdate(
    { _id: userId, walletBalance: { $gte: pkg.price } },
    { $inc: { walletBalance: -pkg.price } },
    { new: true }
  ).select('walletBalance');
  if (!updatedUser) throw new AppError('Số dư ví không đủ', 400);

  // ── Create subscription ──────────────────────────────────────────────────
  let subscription;
  try {
    subscription = await LongTermSubscription.create({
      user: userId,
      package: packageId,
      building: pkg.building,
      plateNumber: normalizedPlate,
      slot: resolvedSlotId,
      startDate: resolvedStart,
      endDate,
      status: 'active',
    });

    // Reserve the slot if one was assigned
    if (resolvedSlotId) {
      await ParkingSlot.findByIdAndUpdate(resolvedSlotId, { status: 'reserved' });
    }
  } catch (err) {
    // Rollback wallet debit on failure
    await User.findByIdAndUpdate(userId, { $inc: { walletBalance: pkg.price } });
    // Rollback slot status if it was changed
    if (resolvedSlotId) {
      await ParkingSlot.findByIdAndUpdate(resolvedSlotId, { status: 'available' });
    }
    throw err;
  }

  // ── Wallet transaction record ────────────────────────────────────────────
  try {
    await WalletTransaction.create({
      user: userId,
      type: 'debit',
      amount: pkg.price,
      balanceAfter: updatedUser.walletBalance,
      status: 'success',
      reason: 'long_term_subscription',
      metadata: { packageId: pkg._id, subscriptionId: subscription._id },
    });
  } catch (txErr) {
    logger.error('[longTerm.subscribe] WalletTransaction record failed:', txErr.message);
  }

  return subscription;
};

/**
 * Release a dedicated slot back to 'available' when its subscription ends.
 * Called when a subscription is cancelled or detected as expired.
 */
const releaseSubscriptionSlot = async (subscription) => {
  if (!subscription.slot) return;
  try {
    await ParkingSlot.findByIdAndUpdate(subscription.slot, { status: 'available' });
  } catch (err) {
    logger.error('[longTerm.releaseSlot] Failed to release slot:', err.message);
  }
};

const cancelSubscription = async (userId, subscriptionId, { cancelReason, cancelNote } = {}) => {
  const validReasons = ['change_slot', 'change_vehicle', 'no_longer_needed', 'pricing_issue', 'other'];
  if (!cancelReason || !validReasons.includes(cancelReason)) {
    throw new AppError('Lý do hủy không hợp lệ', 400);
  }
  if (cancelReason === 'other' && (!cancelNote || !cancelNote.trim())) {
    throw new AppError('Ghi chú chi tiết là bắt buộc khi chọn lý do khác', 400);
  }

  const mongoSession = await mongoose.startSession();
  try {
    let result;
    await mongoSession.withTransaction(async () => {
      const subscription = await LongTermSubscription.findOne({ _id: subscriptionId, user: userId })
        .populate('package')
        .session(mongoSession);

      if (!subscription) {
        throw new AppError('Không tìm thấy gói đăng ký dài hạn', 404);
      }

      if (subscription.status === 'cancelled') {
        throw new AppError('Gói đăng ký đã được hủy trước đó', 400);
      }

      if (subscription.status !== 'active' && subscription.status !== 'pending') {
        throw new AppError('Chỉ được phép hủy gói ở trạng thái active hoặc pending', 400);
      }

      const now = new Date();
      const startDate = new Date(subscription.startDate);
      const diffMs = now.getTime() - startDate.getTime();
      const threeDaysMs = 3 * 24 * 60 * 60 * 1000;

      if (now.getTime() > startDate.getTime() && diffMs > threeDaysMs) {
        throw new AppError('Gói dài hạn đã vượt quá thời hạn cho phép tự hủy (3 ngày)', 400);
      }

      subscription.status = 'cancelled';
      subscription.cancelReason = cancelReason;
      subscription.cancelNote = cancelNote || '';
      await subscription.save({ session: mongoSession });

      if (subscription.slot) {
        await ParkingSlot.findByIdAndUpdate(
          subscription.slot,
          { status: 'available' },
          { session: mongoSession }
        );
      }

      const packagePrice = subscription.package.price;
      const refundAmount = Math.round(packagePrice * 0.95);

      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { $inc: { walletBalance: refundAmount } },
        { new: true, session: mongoSession }
      ).select('walletBalance');

      if (!updatedUser) {
        throw new AppError('Không thể cập nhật số dư tài khoản người dùng', 500);
      }

      await WalletTransaction.create(
        [{
          user: userId,
          type: 'refund',
          amount: refundAmount,
          balanceAfter: updatedUser.walletBalance,
          status: 'success',
          reason: 'long_term_subscription_cancellation',
          metadata: {
            subscriptionId: subscription._id,
            cancelReason,
            cancelNote,
            refundAmount,
            originalPrice: packagePrice,
          },
        }],
        { session: mongoSession }
      );

      result = subscription;
    });

    return result;
  } finally {
    await mongoSession.endSession();
  }
};

const GRACE_DAYS = 7;

/**
 * Gia hạn một gói dài hạn: cộng dồn thêm 1 kỳ (durationDays của package) và
 * giữ nguyên slot cố định. Cho phép khi gói đang 'active', hoặc đã 'expired'
 * nhưng vẫn trong grace 7 ngày (slot chưa bị thu hồi).
 */
const renewSubscription = async (userId, subscriptionId) => {
  const mongoSession = await mongoose.startSession();
  try {
    let result;
    await mongoSession.withTransaction(async () => {
      const subscription = await LongTermSubscription.findOne({ _id: subscriptionId, user: userId })
        .populate('package')
        .session(mongoSession);

      if (!subscription) {
        throw new AppError('Không tìm thấy gói đăng ký dài hạn', 404);
      }
      if (!subscription.package) {
        throw new AppError('Gói gốc không còn tồn tại, không thể gia hạn', 400);
      }

      const now = new Date();
      const endDate = new Date(subscription.endDate);
      const graceCutoff = new Date(now.getTime() - GRACE_DAYS * 24 * 60 * 60 * 1000);

      if (subscription.status === 'active') {
        // ok
      } else if (subscription.status === 'expired') {
        // Chỉ cho gia hạn khi còn trong grace và slot chưa bị thu hồi.
        if (subscription.slotReleased || endDate < graceCutoff) {
          throw new AppError(
            'Gói đã quá thời hạn gia hạn (quá 7 ngày). Vui lòng mua gói mới.',
            400,
          );
        }
      } else {
        throw new AppError('Chỉ được gia hạn gói ở trạng thái active hoặc vừa hết hạn', 400);
      }

      const pkg = subscription.package;

      // Trừ ví (atomic) — pattern giống subscribe.
      const updatedUser = await User.findOneAndUpdate(
        { _id: userId, walletBalance: { $gte: pkg.price } },
        { $inc: { walletBalance: -pkg.price } },
        { new: true, session: mongoSession },
      ).select('walletBalance');
      if (!updatedUser) throw new AppError('Số dư ví không đủ', 400);

      // Cộng dồn từ endDate nếu còn hạn, hoặc từ now nếu đã hết hạn.
      const newStart = endDate.getTime() > now.getTime() ? endDate : now;
      const newEnd = new Date(newStart.getTime() + pkg.durationDays * 24 * 60 * 60 * 1000);

      subscription.endDate = newEnd;
      subscription.status = 'active';
      subscription.remindersSent = [];
      subscription.slotReleased = false;
      await subscription.save({ session: mongoSession });

      await WalletTransaction.create(
        [{
          user: userId,
          type: 'debit',
          amount: pkg.price,
          balanceAfter: updatedUser.walletBalance,
          status: 'success',
          reason: 'long_term_subscription_renewal',
          metadata: { packageId: pkg._id, subscriptionId: subscription._id, newEndDate: newEnd },
        }],
        { session: mongoSession },
      );

      result = subscription;
    });

    return result;
  } finally {
    await mongoSession.endSession();
  }
};

const listSubscriptions = async (userId, query = {}) => {
  const filter = { user: userId };
  if (query.status) filter.status = query.status;

  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);

  const [items, total] = await Promise.all([
    LongTermSubscription.find(filter)
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('package', 'name code price durationDays')
      .populate('building', 'name address')
      .populate('slot', 'code floor status'),
    LongTermSubscription.countDocuments(filter),
  ]);

  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

module.exports = { listPackages, subscribe, listSubscriptions, cancelSubscription, renewSubscription, releaseSubscriptionSlot };
