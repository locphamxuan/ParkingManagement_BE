const mongoose = require('mongoose');
const {
  Payment,
  BuildingWallet,
  BuildingWalletTransaction,
} = require('../../models');
const AppError = require('../../utils/AppError');
const {
  REVENUE_PAYMENT_TYPES,
  ONLINE_PAYMENT_METHODS,
} = require('../../constants/finance');

const { PAYMENT_TYPES, PAYMENT_METHODS, PAYMENT_STATUS } = Payment;

const optionalEnum = (value, allowed, field) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new AppError(`Invalid ${field}`, 400);
  }
  return value;
};

const optionalDate = (value, field) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new AppError(`Invalid ${field} date`, 400);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new AppError(`Invalid ${field} date`, 400);
  return parsed;
};

const parseRange = ({ from, to }) => {
  if (!from || !to) throw new AppError('from and to date are required', 400);
  const dateFrom = new Date(from);
  const dateTo = new Date(to);
  if (Number.isNaN(dateFrom.getTime()) || Number.isNaN(dateTo.getTime())) {
    throw new AppError('Invalid date format', 400);
  }
  if (dateFrom > dateTo) throw new AppError('from must be before or equal to to', 400);
  dateFrom.setHours(0, 0, 0, 0);
  dateTo.setHours(23, 59, 59, 999);
  return { dateFrom, dateTo };
};

const moneyWhen = (condition) => ({
  $sum: { $cond: [condition, '$amount', 0] },
});
const countWhen = (condition) => ({
  $sum: { $cond: [condition, 1, 0] },
});

/**
 * System-owner financial report.
 *
 * grossRevenue = successful earned payments
 * refunds      = money returned to customers
 * netRevenue   = grossRevenue - refunds
 * pendingCash  = money staff recorded but manager has not confirmed receiving
 * walletFunding = top-ups/capital movements (explicitly NOT revenue)
 */
const getReport = async ({ from, to, buildingId } = {}) => {
  const { dateFrom, dateTo } = parseRange({ from, to });
  const buildingFilter = buildingId
    ? new mongoose.Types.ObjectId(String(buildingId))
    : null;

  const earned = {
    $and: [
      { $eq: ['$status', 'success'] },
      { $in: ['$type', REVENUE_PAYMENT_TYPES] },
    ],
  };
  const refunded = {
    $and: [{ $eq: ['$status', 'success'] }, { $eq: ['$type', 'refund'] }],
  };
  const pendingCash = {
    $and: [
      { $eq: ['$status', 'pending'] },
      { $eq: ['$method', 'cash'] },
      { $in: ['$type', REVENUE_PAYMENT_TYPES] },
    ],
  };
  const funded = {
    $and: [{ $eq: ['$status', 'success'] }, { $eq: ['$type', 'topup'] }],
  };
  // Revenue sources must be a mutually exclusive partition of gross revenue.
  // An incident reference is metadata and must not turn another payment type
  // (for example a parking session) into penalty revenue.
  const earnedType = (type) => ({
    $and: [earned, { $eq: ['$type', type] }],
  });

  const rows = await Payment.aggregate([
    // Legacy successful records have no settledAt. They fall back to createdAt.
    { $set: { effectiveAt: { $ifNull: ['$settledAt', '$createdAt'] } } },
    {
      $match: {
        building: buildingFilter || { $ne: null },
        effectiveAt: { $gte: dateFrom, $lte: dateTo },
      },
    },
    {
      $group: {
        _id: '$building',
        grossRevenue: moneyWhen(earned),
        refunds: moneyWhen(refunded),
        pendingCash: moneyWhen(pendingCash),
        walletFunding: moneyWhen(funded),
        paymentCount: countWhen(earned),
        pendingCashCount: countWhen(pendingCash),
        cashAmount: moneyWhen({ $and: [earned, { $eq: ['$method', 'cash'] }] }),
        walletAmount: moneyWhen({ $and: [earned, { $eq: ['$method', 'wallet'] }] }),
        onlineAmount: moneyWhen({ $and: [earned, { $in: ['$method', ONLINE_PAYMENT_METHODS] }] }),
        parkingAmount: moneyWhen(earnedType('session')),
        subscriptionAmount: moneyWhen(earnedType('subscription')),
        penaltyAmount: moneyWhen(earnedType('penalty')),
      },
    },
    {
      $lookup: {
        from: 'buildings',
        localField: '_id',
        foreignField: '_id',
        as: 'building',
      },
    },
    { $unwind: { path: '$building', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        buildingId: '$_id',
        buildingName: '$building.name',
        buildingCode: '$building.code',
        grossRevenue: 1,
        refunds: 1,
        netRevenue: { $subtract: ['$grossRevenue', '$refunds'] },
        pendingCash: 1,
        walletFunding: 1,
        paymentCount: 1,
        // Backward-compatible names used by the existing admin frontend.
        totalRevenue: '$grossRevenue',
        sessionCount: '$paymentCount',
        pendingCashCount: 1,
        cashAmount: 1,
        walletAmount: 1,
        qrAmount: '$onlineAmount',
        onlineAmount: 1,
        // Nguồn doanh thu của các sản phẩm ĐANG bán. `other` là phần còn lại của
        // grossRevenue không thuộc 3 nhóm trên — hiện chỉ gồm bản ghi LỊCH SỬ
        // (vd Payment.type='reservation' từ tính năng đặt chỗ đã bỏ). Giữ `other`
        // để tổng 4 mục luôn khớp grossRevenue mà không quảng bá đặt chỗ như một
        // sản phẩm đang hoạt động.
        bySource: {
          parking: '$parkingAmount',
          subscription: '$subscriptionAmount',
          penalty: '$penaltyAmount',
          other: {
            $subtract: [
              '$grossRevenue',
              { $add: ['$parkingAmount', '$subscriptionAmount', '$penaltyAmount'] },
            ],
          },
        },
      },
    },
    { $sort: { grossRevenue: -1 } },
  ]);

  const summary = rows.reduce(
    (sum, row) => {
      sum.grossRevenue += row.grossRevenue;
      sum.refunds += row.refunds;
      sum.netRevenue += row.netRevenue;
      sum.pendingCash += row.pendingCash;
      sum.walletFunding += row.walletFunding;
      sum.successfulPayments += row.paymentCount;
      sum.pendingCashPayments += row.pendingCashCount;
      return sum;
    },
    {
      grossRevenue: 0,
      refunds: 0,
      netRevenue: 0,
      pendingCash: 0,
      walletFunding: 0,
      successfulPayments: 0,
      pendingCashPayments: 0,
    },
  );

  return {
    from,
    to,
    items: rows,
    // Kept for old clients; semantically this is gross collected revenue.
    grandTotal: summary.grossRevenue,
    summary,
    definitions: {
      grossRevenue: 'Successful parking, subscription and penalty payments, plus legacy record types kept for historical periods.',
      refunds: 'Money successfully returned to customers.',
      netRevenue: 'Gross revenue minus refunds.',
      pendingCash: 'Cash recorded by staff but not yet confirmed by a manager.',
      walletFunding: 'Wallet/building top-ups; a funding movement, not revenue.',
      bySource: 'Current product sources (parking, subscription, penalty). "other" holds legacy record types so the four values always add up to grossRevenue.',
      recognitionBasis: 'Cash basis: successful payments are recognized at settledAt.',
    },
  };
};

const listPayments = async (query = {}) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 30, 1), 200);
  const filter = {};
  if (query.buildingId) {
    if (typeof query.buildingId !== 'string' || !mongoose.isValidObjectId(query.buildingId)) {
      throw new AppError('Invalid buildingId', 400);
    }
    filter.building = new mongoose.Types.ObjectId(query.buildingId);
  }
  const type = optionalEnum(query.type, PAYMENT_TYPES, 'type');
  const method = optionalEnum(query.method, PAYMENT_METHODS, 'method');
  const status = optionalEnum(query.status, PAYMENT_STATUS, 'status');
  if (type) filter.type = type;
  if (method) filter.method = method;
  if (status) filter.status = status;
  if (query.from || query.to) {
    const effectiveRange = {};
    const from = optionalDate(query.from, 'from');
    const to = optionalDate(query.to, 'to');
    if (from) effectiveRange.$gte = from;
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      effectiveRange.$lte = end;
    }
    filter.$or = [
      { settledAt: effectiveRange },
      { settledAt: null, createdAt: effectiveRange },
    ];
  }

  // Every value in this server-owned filter is converted above to an ObjectId/Date
  // or selected from a fixed enum. The global request sanitizer also removes Mongo
  // operators and dotted keys. S5147 cannot infer those guards across the helpers.
  const [items, total] = await Promise.all([
    Payment.find(filter) // NOSONAR -- validated scalar filter; no user-supplied operators
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('building', 'name code')
      .populate('parkingSession', 'plateNumber entryTime exitTime')
      .populate('user', 'fullName email')
      .populate('staff', 'fullName email'),
    Payment.countDocuments(filter), // NOSONAR -- same validated filter as the read query
  ]);
  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

/**
 * Read-only reconciliation center for the system owner. Admin identifies
 * anomalies; the relevant manager still confirms physical cash for separation
 * of duties.
 */
const getReconciliation = async ({ staleHours = 24 } = {}) => {
  const hours = Math.min(Math.max(Number(staleHours) || 24, 1), 720);
  const staleBefore = new Date(Date.now() - hours * 60 * 60 * 1000);
  const revenueOrPenalty = { $in: REVENUE_PAYMENT_TYPES };

  const [pendingCash, staleElectronic, reconciliationRequired, wallets, ledgerRows] =
    await Promise.all([
      Payment.aggregate([
        { $match: { type: revenueOrPenalty, method: 'cash', status: 'pending' } },
        { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: '$amount' } } },
      ]),
      Payment.aggregate([
        {
          $match: {
            type: revenueOrPenalty,
            method: { $ne: 'cash' },
            status: 'pending',
            createdAt: { $lte: staleBefore },
          },
        },
        { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: '$amount' } } },
      ]),
      Payment.aggregate([
        { $match: { status: 'reconciliation_required' } },
        { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: '$amount' } } },
      ]),
      BuildingWallet.find({}).select('building balance').lean(),
      BuildingWalletTransaction.aggregate([
        {
          $group: {
            _id: '$building',
            ledgerBalance: {
              $sum: {
                $cond: [{ $eq: ['$type', 'credit'] }, '$amount', { $multiply: ['$amount', -1] }],
              },
            },
          },
        },
      ]),
    ]);

  const ledgerMap = new Map(ledgerRows.map((row) => [String(row._id), row.ledgerBalance]));
  const walletMismatches = wallets
    .map((wallet) => {
      const ledgerBalance = ledgerMap.get(String(wallet.building)) || 0;
      return {
        buildingId: wallet.building,
        walletBalance: wallet.balance,
        ledgerBalance,
        difference: wallet.balance - ledgerBalance,
      };
    })
    .filter((row) => Math.abs(row.difference) > 0);

  return {
    generatedAt: new Date(),
    staleThresholdHours: hours,
    pendingCash: pendingCash[0] || { count: 0, amount: 0 },
    staleElectronic: staleElectronic[0] || { count: 0, amount: 0 },
    reconciliationRequired: reconciliationRequired[0] || { count: 0, amount: 0 },
    walletIntegrity: {
      checked: wallets.length,
      mismatchCount: walletMismatches.length,
      mismatches: walletMismatches,
    },
    responsibility: {
      admin: 'Monitors and investigates system-wide anomalies.',
      manager: 'Confirms physical cash and resolves the affected building operation.',
    },
  };
};

module.exports = { getReport, listPayments, getReconciliation };
