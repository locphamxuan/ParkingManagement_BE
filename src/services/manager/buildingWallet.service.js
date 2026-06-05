const mongoose = require('mongoose');
const BuildingWallet = require('../../models/finance/BuildingWallet');
const BuildingWalletTransaction = require('../../models/finance/BuildingWalletTransaction');
const SystemWallet = require('../../models/finance/SystemWallet');
const AppError = require('../../utils/AppError');

// ─── Day helpers (local-server time) ───────────────────────────────────────────

const pad2 = (n) => String(n).padStart(2, '0');
const localDayKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/**
 * Resolve a day to its local-time bounds + 'YYYY-MM-DD' key.
 * Accepts a Date, a 'YYYY-MM-DD' string, or nothing (today).
 */
const dayBounds = (date) => {
  let base;
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [y, m, d] = date.split('-').map(Number);
    base = new Date(y, m - 1, d); // local midnight
  } else {
    base = date ? new Date(date) : new Date();
  }
  const start = new Date(base);
  start.setHours(0, 0, 0, 0);
  const end = new Date(base);
  end.setHours(23, 59, 59, 999);
  return { start, end, key: localDayKey(start) };
};

/**
 * Lấy hoặc tạo BuildingWallet cho building.
 */
const getOrCreate = async (buildingId) => {
  let wallet = await BuildingWallet.findOne({ building: buildingId });
  if (!wallet) {
    wallet = await BuildingWallet.create({ building: buildingId });
  }
  return wallet;
};

/**
 * Credit (cộng tiền) vào BuildingWallet — atomic.
 * Gọi trong MongoDB transaction (session parameter).
 */
const credit = async (buildingId, amount, reason, relatedPaymentId, mongoSession) => {
  const opts = mongoSession ? { session: mongoSession } : {};

  const wallet = await BuildingWallet.findOneAndUpdate(
    { building: buildingId },
    { $inc: { balance: amount, totalReceived: amount } },
    { new: true, upsert: true, ...opts },
  );

  await BuildingWalletTransaction.create(
    [{
      building: buildingId,
      type: 'credit',
      amount,
      balanceAfter: wallet.balance,
      reason,
      relatedPayment: relatedPaymentId || null,
    }],
    opts,
  );

  return wallet;
};

/**
 * Debit (trừ tiền) từ BuildingWallet — atomic.
 */
const debit = async (buildingId, amount, reason, relatedPaymentId, performedById, mongoSession) => {
  const opts = mongoSession ? { session: mongoSession } : {};

  const wallet = await BuildingWallet.findOneAndUpdate(
    { building: buildingId, balance: { $gte: amount } },
    { $inc: { balance: -amount } },
    { new: true, ...opts },
  );
  if (!wallet) throw new AppError('Insufficient building wallet balance', 400);

  await BuildingWalletTransaction.create(
    [{
      building: buildingId,
      type: 'debit',
      amount,
      balanceAfter: wallet.balance,
      reason,
      relatedPayment: relatedPaymentId || null,
      performedBy: performedById || null,
    }],
    opts,
  );

  return wallet;
};

/**
 * Daily revenue for a building (parking_fee + reservation_fee credits).
 * @param {string|ObjectId} buildingId
 * @param {Date|string} [date] - Date or 'YYYY-MM-DD' (defaults to today)
 */
const getDailyRevenue = async (buildingId, date) => {
  const { start, end, key } = dayBounds(date);

  const result = await BuildingWalletTransaction.aggregate([
    {
      $match: {
        building: new mongoose.Types.ObjectId(String(buildingId)),
        type: 'credit',
        reason: { $in: ['parking_fee', 'reservation_fee'] },
        createdAt: { $gte: start, $lte: end },
      },
    },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);

  const totalRevenue = result[0]?.total ?? 0;

  return { date: key, totalRevenue };
};

/**
 * List giao dịch ví tòa nhà (phân trang).
 */
const listTransactions = async (buildingId, query = {}) => {
  const filter = { building: buildingId };
  if (query.type) filter.type = query.type;
  if (query.reason) filter.reason = query.reason;

  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);

  const [items, total] = await Promise.all([
    BuildingWalletTransaction.find(filter)
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('performedBy', 'fullName email')
      .populate('relatedPayment', 'type method amount'),
    BuildingWalletTransaction.countDocuments(filter),
  ]);

  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

/**
 * Manager manually transfers money from their building wallet to the system (admin) wallet
 * as payment for an admin subscription package.
 *
 * @param {string|ObjectId} buildingId
 * @param {number} amount - exact price of the subscription package
 * @param {string|ObjectId} performedById - manager user ID
 * @param {string|ObjectId} [packageId] - optional reference to AdminSubscriptionPackage
 */
const manualTransferToAdmin = async (buildingId, amount, performedById, packageId) => {
  const amt = Number(amount);
  if (!amt || amt <= 0) throw new AppError('amount must be a positive number', 400);

  const mongoSession = await mongoose.startSession();
  try {
    let updatedBuildingWallet;
    await mongoSession.withTransaction(async () => {
      updatedBuildingWallet = await debit(
        buildingId, amt, 'admin_subscription', null, performedById, mongoSession,
      );

      await SystemWallet.findOneAndUpdate(
        {},
        { $inc: { balance: amt } },
        { new: true, upsert: true, session: mongoSession },
      );

      await BuildingWallet.findOneAndUpdate(
        { building: buildingId },
        { $inc: { totalTransferred: amt } },
        { session: mongoSession },
      );
    });

    return updatedBuildingWallet;
  } finally {
    mongoSession.endSession();
  }
};

module.exports = {
  getOrCreate,
  credit,
  debit,
  getDailyRevenue,
  listTransactions,
  manualTransferToAdmin,
};
