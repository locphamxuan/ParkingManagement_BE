const LongTermPackage = require('../../models/policy/LongTermPackage');
const LongTermSubscription = require('../../models/policy/LongTermSubscription');
const WalletTransaction = require('../../models/finance/WalletTransaction');
const User = require('../../models/user/User');
const AppError = require('../../utils/AppError');

const listPackages = async (buildingId) => {
  if (!buildingId) throw new AppError('buildingId is required', 400);

  const packages = await LongTermPackage.find({ building: buildingId, isActive: true })
    .populate('vehicleType', 'name');
  return packages;
};

const subscribe = async (userId, { packageId, plateNumber }) => {
  const pkg = await LongTermPackage.findById(packageId);
  if (!pkg || !pkg.isActive) throw new AppError('Package not found or inactive', 404);

  const now = new Date();
  const endDate = new Date(now.getTime() + pkg.durationDays * 24 * 60 * 60 * 1000);

  const updatedUser = await User.findOneAndUpdate(
    { _id: userId, walletBalance: { $gte: pkg.price } },
    { $inc: { walletBalance: -pkg.price } },
    { new: true }
  ).select('walletBalance');
  if (!updatedUser) throw new AppError('Số dư ví không đủ', 400);

  let subscription;
  try {
    subscription = await LongTermSubscription.create({
      user: userId,
      package: packageId,
      building: pkg.building,
      plateNumber: String(plateNumber).trim().toUpperCase(),
      startDate: now,
      endDate,
      status: 'active',
    });
  } catch (err) {
    await User.findByIdAndUpdate(userId, { $inc: { walletBalance: pkg.price } });
    throw err;
  }

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
      .populate('building', 'name address'),
    LongTermSubscription.countDocuments(filter),
  ]);

  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

module.exports = { listPackages, subscribe, listSubscriptions };
