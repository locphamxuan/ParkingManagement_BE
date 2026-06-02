const mongoose = require('mongoose');
const BuildingWallet = require('../../models/finance/BuildingWallet');
const BuildingWalletTransaction = require('../../models/finance/BuildingWalletTransaction');
const SystemWallet = require('../../models/finance/SystemWallet');
const DailyRevenueSettlement = require('../../models/finance/DailyRevenueSettlement');
const AppError = require('../../utils/AppError');

const ADMIN_SHARE_RATE = 0.3; // 30% of a building's daily revenue goes to the admin (system) wallet

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
 * Tính doanh thu của 1 ngày (parking_fee + reservation_fee) + chỉ tiêu 30%.
 * @param {string|ObjectId} buildingId
 * @param {Date|string} [date] - Date hoặc 'YYYY-MM-DD' (mặc định: hôm nay)
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
  const targetTransfer = Math.floor(totalRevenue * ADMIN_SHARE_RATE);

  return { date: key, totalRevenue, targetTransfer };
};

/**
 * Tự động trích 30% doanh thu của 1 ngày: BuildingWallet → SystemWallet.
 * Idempotent: mỗi (building, ngày) chỉ chạy đúng 1 lần nhờ unique index +
 * kiểm tra tồn tại. An toàn để gọi lại nhiều lần (catch-up).
 *
 * @param {string|ObjectId} buildingId
 * @param {Date|string} date - ngày cần trích ('YYYY-MM-DD' hoặc Date)
 * @returns {Promise<{settlement: object, alreadySettled: boolean}>}
 */
const settleDailyRevenue = async (buildingId, date) => {
  const { key } = dayBounds(date);

  // Idempotent fast-path
  const existing = await DailyRevenueSettlement.findOne({ building: buildingId, date: key });
  if (existing) return { settlement: existing, alreadySettled: true };

  const { totalRevenue } = await getDailyRevenue(buildingId, key);
  const target = Math.floor(totalRevenue * ADMIN_SHARE_RATE);

  const mongoSession = await mongoose.startSession();
  try {
    const out = await mongoSession.withTransaction(async () => {
      let transferred = 0;
      let systemBalanceAfter = 0;
      let note = '';

      if (target > 0) {
        const wallet = await BuildingWallet.findOne({ building: buildingId }).session(mongoSession);
        const balance = wallet?.balance ?? 0;
        transferred = Math.min(target, balance);

        if (transferred > 0) {
          await debit(buildingId, transferred, 'transfer_to_system', null, null, mongoSession);
          const systemWallet = await SystemWallet.findOneAndUpdate(
            {},
            { $inc: { balance: transferred } },
            { new: true, upsert: true, session: mongoSession },
          );
          systemBalanceAfter = systemWallet.balance;
          await BuildingWallet.findOneAndUpdate(
            { building: buildingId },
            { $inc: { totalTransferred: transferred } },
            { session: mongoSession },
          );
        } else {
          const systemWallet = await SystemWallet.findOne({}).session(mongoSession);
          systemBalanceAfter = systemWallet?.balance ?? 0;
        }

        if (transferred < target) {
          note = `Shortfall: target ${target}, transferred ${transferred} (insufficient building balance)`;
        }
      } else {
        const systemWallet = await SystemWallet.findOne({}).session(mongoSession);
        systemBalanceAfter = systemWallet?.balance ?? 0;
      }

      const [settlement] = await DailyRevenueSettlement.create(
        [{
          building: buildingId,
          date: key,
          revenue: totalRevenue,
          targetAmount: target,
          transferredAmount: transferred,
          systemBalanceAfter,
          note,
        }],
        { session: mongoSession },
      );

      return { settlement, alreadySettled: false };
    });
    return out;
  } catch (err) {
    // Concurrent run already settled this day (unique index) → treat as no-op
    if (err && err.code === 11000) {
      const settled = await DailyRevenueSettlement.findOne({ building: buildingId, date: key });
      return { settlement: settled, alreadySettled: true };
    }
    throw err;
  } finally {
    mongoSession.endSession();
  }
};

/**
 * Lịch sử trích doanh thu tự động (phân trang).
 */
const listSettlements = async (buildingId, query = {}) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 30, 1), 100);

  const filter = { building: buildingId };
  const [items, total] = await Promise.all([
    DailyRevenueSettlement.find(filter)
      .sort('-date')
      .skip((page - 1) * limit)
      .limit(limit),
    DailyRevenueSettlement.countDocuments(filter),
  ]);

  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
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

module.exports = {
  getOrCreate,
  credit,
  debit,
  getDailyRevenue,
  settleDailyRevenue,
  listSettlements,
  listTransactions,
};
