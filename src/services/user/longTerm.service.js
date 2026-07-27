const LongTermPackage = require('../../models/policy/LongTermPackage');
const LongTermSubscription = require('../../models/policy/LongTermSubscription');
const ParkingSlot = require('../../models/building/ParkingSlot');
const { getRefundPercent } = require('../../utils/refundPolicy');
const ParkingSession = require('../../models/operations/ParkingSession');
const WalletTransaction = require('../../models/finance/WalletTransaction');
const Payment = require('../../models/finance/Payment');
const User = require('../../models/user/User');
const Notification = require('../../models/log/Notification');
const AppError = require('../../utils/AppError');
const mongoose = require('mongoose');
const { normalizePlate, plateMatchRegex } = require('../../utils/plate.util');
const buildingWalletService = require('../manager/buildingWallet.service');
const {
  claimFixedSlotForRenewal,
} = require('../shared/slotLifecycle.service');

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

const subscribe = async (userId, { packageId, plateNumber, slotId }) => {
  // Chuẩn hoá biển số về dạng canonical (giống lúc check-in) để gói luôn được
  // nhận diện khi staff quét xe — tránh lệch '59G2-81000' vs '59G2-810.00'.
  const normalizedPlate = normalizePlate(plateNumber);
  if (!normalizedPlate) {
    throw new AppError('Biển số xe không hợp lệ', 400);
  }
  const ownedPlate = await User.exists({
    _id: userId,
    'licensePlates.plateNumber': plateMatchRegex(normalizedPlate) || normalizedPlate,
  });
  if (!ownedPlate) {
    throw new AppError(
      'Biển số không thuộc tài khoản hiện tại',
      403,
      'PLATE_OWNERSHIP_REQUIRED',
    );
  }

  // Kiểm tra xem biển số này đã đăng ký gói dài hạn nào đang hoạt động / chờ thanh toán chưa.
  // 1 biển số = 1 gói tại một thời điểm (xét cả 'active' lẫn 'pending').
  const existingActiveSub = await LongTermSubscription.findOne({
    plateNumber: normalizedPlate,
    status: { $in: ['active', 'pending'] },
  });

  if (existingActiveSub) {
    throw new AppError('Biển số xe này đã đăng ký một gói dài hạn khác đang hoạt động hoặc chờ thanh toán', 400);
  }

  const pkg = await LongTermPackage.findById(packageId);
  if (!pkg || !pkg.isActive) throw new AppError('Package not found or inactive', 404);

  // ── Start/end dates: gói luôn bắt đầu NGAY tại thời điểm mua (không cho chọn
  // ngày tương lai) — tránh trạng thái "active" nhưng chưa tới hạn dùng được. ──
  const resolvedStart = new Date();
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
        {
          _id: userId,
          walletBalance: { $gte: pkg.price },
          'licensePlates.plateNumber': plateMatchRegex(normalizedPlate) || normalizedPlate,
        },
        { $inc: { walletBalance: -pkg.price } },
        { new: true, session: mongoSession },
      ).select('walletBalance');
      if (!updatedUser) {
        const stillOwnsPlate = await User.exists({
          _id: userId,
          'licensePlates.plateNumber': plateMatchRegex(normalizedPlate) || normalizedPlate,
        }).session(mongoSession);
        if (!stillOwnsPlate) {
          throw new AppError(
            'Biển số không còn thuộc tài khoản hiện tại',
            403,
            'PLATE_OWNERSHIP_REQUIRED',
          );
        }
        throw new AppError('Số dư ví không đủ', 400);
      }

      // Slot cố định (tùy chọn): validate ô thuộc dãy 'subscriber' đúng loại xe của gói,
      // rồi claim atomic available→reserved (giữ riêng cả kỳ). null = gói floating.
      let claimedSlotId = null;
      if (slotId) {
        if (!mongoose.Types.ObjectId.isValid(slotId)) {
          throw new AppError('slotId không hợp lệ', 400, 'INVALID_SLOT');
        }
        const slot = await ParkingSlot.findOne({ _id: slotId, building: pkg.building }).session(mongoSession);
        if (!slot) throw new AppError('Không tìm thấy ô đỗ trong tòa nhà của gói', 404, 'SLOT_NOT_FOUND');
        if (slot.usageType !== 'subscriber') {
          throw new AppError('Ô đỗ không thuộc dãy dành cho gói dài hạn', 409, 'SLOT_USAGE_MISMATCH');
        }
        if (slot.vehicleType && `${slot.vehicleType}` !== `${pkg.vehicleType}`) {
          throw new AppError('Ô đỗ không đúng loại xe của gói', 409, 'SLOT_VEHICLE_TYPE_MISMATCH');
        }
        if (slot.reservable === false) {
          throw new AppError('Ô đỗ không cho phép giữ chỗ', 409, 'SLOT_NOT_RESERVABLE');
        }
        const claimed = await ParkingSlot.findOneAndUpdate(
          { _id: slotId, status: 'available' },
          { $set: { status: 'reserved' } },
          { new: true, session: mongoSession },
        );
        if (!claimed) throw new AppError('Ô đỗ vừa được người khác giữ, vui lòng chọn ô khác', 409, 'SLOT_NOT_AVAILABLE');
        claimedSlotId = claimed._id;
      }

      const [created] = await LongTermSubscription.create(
        [{
          user: userId,
          package: packageId,
          building: pkg.building,
          plateNumber: normalizedPlate,
          slot: claimedSlotId,
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

      await Notification.insertMany([{
        user: userId,
        type: 'general',
        title: 'Mua gói dài hạn thành công',
        message: `Đã đăng ký thành công gói ${pkg.name} cho xe ${normalizedPlate}. Hạn sử dụng đến ${endDate.toLocaleDateString('vi-VN')}.`,
        building: pkg.building,
        plateNumber: normalizedPlate,
        isRead: false,
      }], { session: mongoSession });
    });
  } catch (err) {
    // Unique partial index trên { plateNumber, status:'active' } chặn 2 gói active cùng biển
    // (kể cả khi 2 request mua song song lọt qua check ở trên).
    if (err && err.code === 11000 && err.keyPattern?.slot) {
      throw new AppError(
        'Ô đỗ đã thuộc một gói dài hạn khác',
        409,
        'FIXED_SLOT_UNAVAILABLE',
        { requiresSlotSelection: true },
      );
    }
    if (err && err.code === 11000) {
      throw new AppError('Biển số xe này đã đăng ký một gói dài hạn khác đang hoạt động', 400);
    }
    throw err;
  } finally {
    mongoSession.endSession();
  }

  return subscription;
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

      if (subscription.status !== 'active') {
        throw new AppError('Chỉ được phép hủy gói đang hoạt động (active)', 400);
      }

      // Không cho hủy khi biển số thuộc gói này đang có xe trong bãi.
      const vehicleParked = await ParkingSession.exists({
        plateNumber: subscription.plateNumber,
        building: subscription.building,
        paymentMethod: 'long_term',
        status: 'active',
      });
      if (vehicleParked) {
        throw new AppError('Không thể hủy gói khi xe đang đỗ trong bãi — vui lòng cho xe ra trước.', 400, 'VEHICLE_CURRENTLY_PARKED');
      }

      const now = new Date();
      const startDate = new Date(subscription.startDate);
      const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
      const cancellationDeadline = new Date(startDate.getTime() + threeDaysMs);

      if (now > cancellationDeadline) {
        throw new AppError('Gói dài hạn đã vượt quá thời hạn cho phép tự hủy (3 ngày kể từ ngày bắt đầu).', 400, 'CANCELLATION_WINDOW_EXPIRED');
      }

      const packagePrice = subscription.package.price;
      // % hoàn tiền do MANAGER cấu hình — helper chung (default 80, clamp 0–100),
      // nhất quán với hủy reservation và endpoint public /users/reservations/policy.
      const refundPercent = await getRefundPercent(subscription.building, mongoSession);
      const refundAmount = Math.round((packagePrice * refundPercent) / 100);

      subscription.status = 'cancelled';
      subscription.cancelReason = cancelReason;
      subscription.cancelNote = cancelNote || '';
      subscription.refundPercent = refundPercent;
      subscription.refundAmount = refundAmount;
      await subscription.save({ session: mongoSession });

      // Nhả slot cố định (nếu có) về 'available' — chỉ nhả ô đang 'reserved' (giữ chỗ),
      // không đụng ô đang 'occupied'/'maintenance'.
      if (subscription.slot) {
        await ParkingSlot.findOneAndUpdate(
          { _id: subscription.slot, status: 'reserved' },
          { $set: { status: 'available' } },
          { session: mongoSession },
        );
      }

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
            refundPercent,
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
            note: `Long-term ${subscription._id} cancelled — ${refundPercent}% refund`,
          }],
          { session: mongoSession },
        );
        await buildingWalletService.debit(
          subscription.building, refundAmount, 'refund', refundPayment._id, null, mongoSession,
        );
      }

      result = { subscription, refundAmount, refundPercent };
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
      const ownsPlate = await User.exists({
        _id: userId,
        'licensePlates.plateNumber': plateMatchRegex(subscription.plateNumber) || subscription.plateNumber,
      }).session(mongoSession);
      if (!ownsPlate) {
        throw new AppError(
          'Biển số không còn thuộc tài khoản hiện tại',
          403,
          'PLATE_OWNERSHIP_REQUIRED',
        );
      }

      await claimFixedSlotForRenewal(subscription, mongoSession);

      // Trừ ví (atomic) — pattern giống subscribe.
      const updatedUser = await User.findOneAndUpdate(
        {
          _id: userId,
          walletBalance: { $gte: pkg.price },
          'licensePlates.plateNumber':
            plateMatchRegex(subscription.plateNumber) || subscription.plateNumber,
        },
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

      await Notification.insertMany([{
        user: userId,
        type: 'general',
        title: 'Gia hạn gói dài hạn thành công',
        message: `Đã gia hạn thành công gói ${pkg.name} cho xe ${subscription.plateNumber}. Hạn mới đến ${newEnd.toLocaleDateString('vi-VN')}.`,
        building: pkg.building,
        plateNumber: subscription.plateNumber,
        isRead: false,
      }], { session: mongoSession });

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
      .populate('building', 'name address')
      .populate('slot', 'code'),
    LongTermSubscription.countDocuments(filter),
  ]);

  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

const getPackage = async (id) => {
  const pkg = await LongTermPackage.findById(id)
    .populate('vehicleType', 'name code')
    .populate('building', 'name code address');
  if (!pkg) throw new AppError('Package not found', 404, 'PACKAGE_NOT_FOUND');
  return pkg;
};

// Scope theo user để không xem được đăng ký của người khác.
const getSubscription = async (userId, id) => {
  const subscription = await LongTermSubscription.findOne({ _id: id, user: userId })
    .populate('package', 'name code price durationDays maxHoursPerDay')
    .populate('building', 'name address')
    .populate('slot', 'code');
  if (!subscription) throw new AppError('Subscription not found', 404, 'SUBSCRIPTION_NOT_FOUND');
  return subscription;
};

// Cho user xem trước % / số tiền hoàn lại TRƯỚC khi bấm xác nhận hủy — dùng cùng
// getRefundPercent với cancelSubscription nên số hiển thị luôn khớp số thực nhận.
const getRefundPreview = async (userId, id) => {
  const subscription = await LongTermSubscription.findOne({ _id: id, user: userId })
    .populate('package', 'price');
  if (!subscription) throw new AppError('Subscription not found', 404, 'SUBSCRIPTION_NOT_FOUND');
  if (subscription.status !== 'active') {
    throw new AppError('Chỉ có thể xem trước hoàn tiền cho gói đang hoạt động', 400);
  }

  const packagePrice = subscription.package?.price ?? 0;
  const refundPercent = await getRefundPercent(subscription.building);
  const refundAmount = Math.round((packagePrice * refundPercent) / 100);

  return { refundPercent, refundAmount, packagePrice };
};

module.exports = {
  listPackages, getPackage, subscribe, listSubscriptions, getSubscription,
  cancelSubscription, renewSubscription, getRefundPreview,
};
