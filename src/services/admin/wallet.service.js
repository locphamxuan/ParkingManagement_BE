const SystemWallet = require("../../models/finance/SystemWallet");
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

module.exports = { getWallet, topup, distribute, listDistributions };
