const mongoose = require('mongoose');
const BuildingWallet = require('../../models/finance/BuildingWallet');
const BuildingWalletTransaction = require('../../models/finance/BuildingWalletTransaction');
const Payment = require('../../models/finance/Payment');
const AppError = require('../../utils/AppError');

// Loại Payment tính là DOANH THU thật (loại 'topup' = manager tự nạp ví, 'refund' =
// tiền hoàn ra). Khớp định nghĩa doanh thu ở dashboard manager/admin.
const REVENUE_PAYMENT_TYPES = ['session', 'reservation', 'subscription'];

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
 * options.allowNegative = true → cho phép số dư âm (dùng cho refund do manager hủy gói/đặt chỗ).
 */
const debit = async (buildingId, amount, reason, relatedPaymentId, performedById, mongoSession, options = {}) => {
  const opts = mongoSession ? { session: mongoSession } : {};
  const { allowNegative = false } = options;

  let wallet;
  if (allowNegative) {
    wallet = await BuildingWallet.findOneAndUpdate(
      { building: buildingId },
      { $inc: { balance: -amount } },
      { new: true, upsert: true, ...opts },
    );
  } else {
    wallet = await BuildingWallet.findOneAndUpdate(
      { building: buildingId, balance: { $gte: amount } },
      { $inc: { balance: -amount } },
      { new: true, ...opts },
    );
    if (!wallet) throw new AppError('Insufficient building wallet balance', 400);
  }

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
 * Daily revenue for a building (parking_fee + reservation_fee + subscription_fee credits).
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
        reason: { $in: ['parking_fee', 'reservation_fee', 'subscription_fee'] },
        createdAt: { $gte: start, $lte: end },
      },
    },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);

  const totalRevenue = result[0]?.total ?? 0;

  return { date: key, totalRevenue };
};

/**
 * Doanh thu THEO NGÀY × PHƯƠNG THỨC + tổng doanh thu all-time cho 1 tòa.
 * Nguồn: Payment thành công loại doanh thu (session/reservation/subscription) — nhất
 * quán với dashboard, và tách được theo phương thức (cash/wallet/online) mà ví tòa
 * (BuildingWalletTransaction) không lưu. `allTimeTotal` KHÔNG gồm top-up nên phản ánh
 * đúng "tổng doanh thu gửi xe" (khác `wallet.totalReceived` vốn cộng cả top-up).
 * @param {string|ObjectId} buildingId
 * @param {{ from?: string|Date, to?: string|Date }} [range] - mặc định 14 ngày gần nhất
 */
const getRevenueBreakdown = async (buildingId, { from, to } = {}) => {
  const bId = new mongoose.Types.ObjectId(String(buildingId));

  const end = to ? new Date(to) : new Date();
  end.setHours(23, 59, 59, 999);
  const start = from ? new Date(from) : new Date(end);
  if (!from) start.setDate(start.getDate() - 13); // 14 ngày gồm hôm nay
  start.setHours(0, 0, 0, 0);

  const baseMatch = { building: bId, status: 'success', type: { $in: REVENUE_PAYMENT_TYPES } };
  const byMethodStage = {
    total: { $sum: '$amount' },
    cash: { $sum: { $cond: [{ $eq: ['$method', 'cash'] }, '$amount', 0] } },
    wallet: { $sum: { $cond: [{ $eq: ['$method', 'wallet'] }, '$amount', 0] } },
    online: { $sum: { $cond: [{ $in: ['$method', ['qr', 'payos', 'card']] }, '$amount', 0] } },
  };

  const [dayRows, allTime] = await Promise.all([
    Payment.aggregate([
      { $match: { ...baseMatch, createdAt: { $gte: start, $lte: end } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, ...byMethodStage } },
      { $sort: { _id: -1 } },
    ]),
    Payment.aggregate([
      { $match: baseMatch },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
  ]);

  return {
    allTimeTotal: allTime[0]?.total ?? 0,
    days: dayRows.map((r) => ({
      date: r._id,
      total: r.total,
      byMethod: { cash: r.cash, wallet: r.wallet, online: r.online },
    })),
  };
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
  getRevenueBreakdown,
  listTransactions,
};
