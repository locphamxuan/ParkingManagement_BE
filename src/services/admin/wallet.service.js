const mongoose = require("mongoose");
const SystemWallet = require("../../models/finance/SystemWallet");
const BuildingWalletTransaction = require("../../models/finance/BuildingWalletTransaction");
const RevenueDistribution = require("../../models/finance/RevenueDistribution");
const Building = require("../../models/building/Building");
const AppError = require("../../utils/AppError");
const { writeAuditLog } = require("../../utils/audit");

const getWallet = async () => {
  const wallet = await SystemWallet.findOne();
  if (wallet) return wallet;
  return SystemWallet.create({ balance: 0, totalDistributed: 0 });
};

const topup = async (amount) => {
  const amt = Number(amount);
  if (!amt || amt <= 0) throw new AppError("amount must be a positive number", 400);

  const wallet = await SystemWallet.findOneAndUpdate(
    {},
    { $inc: { balance: amt } },
    { new: true, upsert: true }
  );
  return wallet;
};

const distribute = async ({ buildingId, amount, periodStart, periodEnd, note, actor }) => {
  const amt = Number(amount);
  if (!amt || amt <= 0) throw new AppError("amount must be a positive number", 400);
  if (!buildingId) throw new AppError("buildingId is required", 400);
  if (!periodStart || !periodEnd) throw new AppError("periodStart and periodEnd are required", 400);

  const buildingExists = await Building.exists({ _id: buildingId });
  if (!buildingExists) throw new AppError("Building not found", 404);

  const wallet = await SystemWallet.findOneAndUpdate(
    { balance: { $gte: amt } },
    { $inc: { balance: -amt, totalDistributed: amt } },
    { new: true }
  );
  if (!wallet) throw new AppError("Insufficient wallet balance", 400);

  const distribution = await RevenueDistribution.create({
    building: buildingId,
    amount: amt,
    periodStart: new Date(periodStart),
    periodEnd: new Date(periodEnd),
    distributedBy: actor._id,
    note: note || "",
  });

  await writeAuditLog({
    actor,
    action: "DISTRIBUTE_REVENUE",
    targetTable: "revenue_distributions",
    targetId: distribution._id,
    newValue: { building: buildingId, amount: amt },
    severity: "high",
  });

  return { wallet, distribution };
};

const listDistributions = async (query = {}) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);

  const filter = {};
  if (query.buildingId) filter.building = query.buildingId;

  const [items, total] = await Promise.all([
    RevenueDistribution.find(filter)
      .populate("building", "name code")
      .populate("distributedBy", "fullName email")
      .sort("-createdAt")
      .skip((page - 1) * limit)
      .limit(limit),
    RevenueDistribution.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

/**
 * Daily transfer breakdown — money received from building wallets.
 * Groups BuildingWalletTransactions (type=debit, reason=transfer_to_system) by date.
 */
const getDailyTransfers = async (query = {}) => {
  const days = Math.min(Math.max(Number(query.days) || 30, 1), 90);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(start.getDate() - days + 1);
  start.setHours(0, 0, 0, 0);

  // Today's total
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const [dailyRows, todayRows] = await Promise.all([
    BuildingWalletTransaction.aggregate([
      {
        $match: {
          type: 'debit',
          reason: 'transfer_to_system',
          createdAt: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' },
          },
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
      {
        $project: {
          _id: 0,
          date: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: {
                $dateFromParts: {
                  year: '$_id.year',
                  month: '$_id.month',
                  day: '$_id.day',
                },
              },
            },
          },
          total: 1,
          count: 1,
        },
      },
    ]),
    BuildingWalletTransaction.aggregate([
      {
        $match: {
          type: 'debit',
          reason: 'transfer_to_system',
          createdAt: { $gte: todayStart, $lte: todayEnd },
        },
      },
      {
        $group: {
          _id: '$building',
          total: { $sum: '$amount' },
          count: { $sum: 1 },
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
          total: 1,
          count: 1,
        },
      },
      { $sort: { total: -1 } },
    ]),
  ]);

  const todayTotal = todayRows.reduce((sum, r) => sum + r.total, 0);

  return { todayTotal, todayBreakdown: todayRows, trend: dailyRows };
};

module.exports = { getWallet, topup, distribute, listDistributions, getDailyTransfers };
