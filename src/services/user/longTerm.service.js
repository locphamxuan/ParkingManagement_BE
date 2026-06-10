const LongTermPackage = require('../../models/policy/LongTermPackage');
const LongTermSubscription = require('../../models/policy/LongTermSubscription');
const ParkingSlot = require('../../models/building/ParkingSlot');
const WalletTransaction = require('../../models/finance/WalletTransaction');
const User = require('../../models/user/User');
const AppError = require('../../utils/AppError');

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

  // startDate should not be in the past (allow up to 1 hour tolerance)
  if (startDate < new Date(now.getTime() - 60 * 60 * 1000)) {
    throw new AppError('Ngày bắt đầu không được nằm trong quá khứ', 400);
  }
}

const subscribe = async (userId, { packageId, plateNumber, slotId, startDate }) => {
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
    // Verify the package supports dedicated slots
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
      plateNumber: String(plateNumber).trim().toUpperCase(),
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
    console.error('[longTerm.subscribe] WalletTransaction record failed:', txErr.message);
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
    console.error('[longTerm.releaseSlot] Failed to release slot:', err.message);
  }
};

const cancelSubscription = async (userId, subscriptionId) => {
  const subscription = await LongTermSubscription.findOne({ _id: subscriptionId, user: userId });
  if (!subscription) throw new AppError('Subscription not found', 404);
  if (subscription.status === 'cancelled') throw new AppError('Subscription already cancelled', 400);

  subscription.status = 'cancelled';
  await subscription.save();

  // Release the dedicated slot if one was assigned
  await releaseSubscriptionSlot(subscription);

  return subscription;
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

module.exports = { listPackages, subscribe, listSubscriptions, cancelSubscription, releaseSubscriptionSlot };
