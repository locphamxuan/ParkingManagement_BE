const LongTermPackage = require('../../models/policy/LongTermPackage');
const LongTermSubscription = require('../../models/policy/LongTermSubscription');
const WalletTransaction = require('../../models/finance/WalletTransaction');
const Payment = require('../../models/finance/Payment');
const User = require('../../models/user/User');
const AppError = require('../../utils/AppError');
const mongoose = require('mongoose');
const { normalizePlate } = require('../../utils/plate.util');
const buildingWalletService = require('../manager/buildingWallet.service');

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

const subscribe = async (userId, { packageId, plateNumber, startDate }) => {
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

  // Gói floating: KHÔNG giữ slot cố định. Staff gán slot trống lúc check-in.

  // ── Thu tiền + ghi doanh thu (atomic) ────────────────────────────────────
  // Mua gói = doanh thu của TÒA NHÀ: trừ ví user → tạo Payment(subscription) →
  // credit BuildingWallet, giống luồng reservation/checkout.
  const mongoSession = await mongoose.startSession();
  let subscription;
  try {
    await mongoSession.withTransaction(async () => {
      const updatedUser = await User.findOneAndUpdate(
        { _id: userId, walletBalance: { $gte: pkg.price } },
        { $inc: { walletBalance: -pkg.price } },
        { new: true, session: mongoSession },
      ).select('walletBalance');
      if (!updatedUser) throw new AppError('Số dư ví không đủ', 400);

      const [created] = await LongTermSubscription.create(
        [{
          user: userId,
          package: packageId,
          building: pkg.building,
          plateNumber: normalizedPlate,
          startDate: resolvedStart,
          endDate,
          status: 'active',
        }],
        { session: mongoSession },
      );
      subscription = created;

      await WalletTransaction.create(
        [{
          user: userId,
          type: 'debit',
          amount: pkg.price,
          balanceAfter: updatedUser.walletBalance,
          status: 'success',
          reason: 'long_term_subscription',
          metadata: { packageId: pkg._id, subscriptionId: created._id },
        }],
        { session: mongoSession },
      );

      const [payment] = await Payment.create(
        [{
          building: pkg.building,
          subscription: created._id,
          type: 'subscription',
          method: 'wallet',
          amount: pkg.price,
          status: 'success',
          user: userId,
        }],
        { session: mongoSession },
      );

      if (pkg.building) {
        await buildingWalletService.credit(
          pkg.building, pkg.price, 'subscription_fee', payment._id, mongoSession,
        );
      }
    });
  } finally {
    mongoSession.endSession();
  }

  return subscription;
};

const cancelSubscription = async (userId, subscriptionId, { cancelReason, cancelNote } = {}) => {
  const validReasons = ['change_vehicle', 'no_longer_needed', 'pricing_issue', 'other'];
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

      // Hoàn tiền = rút khỏi ví TÒA NHÀ (đối xứng với credit lúc mua) + Payment(refund).
      if (refundAmount > 0 && subscription.building) {
        const [refundPayment] = await Payment.create(
          [{
            building: subscription.building,
            subscription: subscription._id,
            type: 'refund',
            method: 'wallet',
            amount: refundAmount,
            status: 'success',
            user: userId,
            note: `Long-term ${subscription._id} cancelled — 95% refund`,
          }],
          { session: mongoSession },
        );
        await buildingWalletService.debit(
          subscription.building, refundAmount, 'refund', refundPayment._id, null, mongoSession,
        );
      }

      result = subscription;
    });

    return result;
  } finally {
    await mongoSession.endSession();
  }
};

// Số ngày sau khi hết hạn vẫn cho phép gia hạn (gói floating không còn slot).
const RENEW_WINDOW_DAYS = 7;

/**
 * Gia hạn một gói dài hạn: cộng dồn thêm 1 kỳ (durationDays của package).
 * Cho phép khi gói đang 'active', hoặc đã 'expired' nhưng trong vòng 7 ngày.
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
      const renewCutoff = new Date(now.getTime() - RENEW_WINDOW_DAYS * 24 * 60 * 60 * 1000);

      if (subscription.status === 'active') {
        // ok
      } else if (subscription.status === 'expired') {
        // Chỉ cho gia hạn trong vòng 7 ngày kể từ khi hết hạn.
        if (endDate < renewCutoff) {
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

      // Gia hạn = doanh thu tòa nhà → Payment + credit BuildingWallet.
      const [payment] = await Payment.create(
        [{
          building: pkg.building,
          subscription: subscription._id,
          type: 'subscription',
          method: 'wallet',
          amount: pkg.price,
          status: 'success',
          user: userId,
        }],
        { session: mongoSession },
      );
      if (pkg.building) {
        await buildingWalletService.credit(
          pkg.building, pkg.price, 'subscription_fee', payment._id, mongoSession,
        );
      }

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
      .populate('package', 'name code price durationDays maxHoursPerDay')
      .populate('building', 'name address'),
    LongTermSubscription.countDocuments(filter),
  ]);

  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

module.exports = { listPackages, subscribe, listSubscriptions, cancelSubscription, renewSubscription };
