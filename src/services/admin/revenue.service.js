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
  const earnedType = (type) => ({
    $and: [
      earned,
      type === 'penalty'
        ? { $or: [{ $eq: ['$type', 'penalty'] }, { $ne: ['$incident', null] }] }
        : type === 'session'
          ? { $and: [{ $eq: ['$type', 'session'] }, { $eq: ['$incident', null] }] }
          : { $eq: ['$type', type] },
    ],
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
        reservationAmount: moneyWhen(earnedType('reservation')),
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
        bySource: {
          parking: '$parkingAmount',
          reservation: '$reservationAmount',
          subscription: '$subscriptionAmount',
          penalty: '$penaltyAmount',
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
      grossRevenue: 'Successful parking, reservation, subscription and penalty payments.',
      refunds: 'Money successfully returned to customers.',
      netRevenue: 'Gross revenue minus refunds.',
      pendingCash: 'Cash recorded by staff but not yet confirmed by a manager.',
      walletFunding: 'Wallet/building top-ups; a funding movement, not revenue.',
      recognitionBasis: 'Cash basis: successful payments are recognized at settledAt.',
    },
  };
};

const listPayments = async (query = {}) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 30, 1), 200);
  const filter = {};
  if (query.buildingId) filter.building = query.buildingId;
  if (query.type) filter.type = query.type;
  if (query.method) filter.method = query.method;
  if (query.status) filter.status = query.status;
  if (query.from || query.to) {
    const effectiveRange = {};
    if (query.from) effectiveRange.$gte = new Date(query.from);
    if (query.to) {
      const end = new Date(query.to);
      end.setHours(23, 59, 59, 999);
      effectiveRange.$lte = end;
    }
    filter.$or = [
      { settledAt: effectiveRange },
      { settledAt: null, createdAt: effectiveRange },
    ];
  }

  const [items, total] = await Promise.all([
    Payment.find(filter)
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('building', 'name code')
      .populate('parkingSession', 'plateNumber entryTime exitTime')
      .populate('user', 'fullName email')
      .populate('staff', 'fullName email'),
    Payment.countDocuments(filter),
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
