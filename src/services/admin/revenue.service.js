const Payment = require("../../models/finance/Payment");
const AppError = require("../../utils/AppError");
const mongoose = require("mongoose");

const getReport = async ({ from, to, buildingId } = {}) => {
  if (!from || !to) throw new AppError("from and to date are required", 400);

  const dateFrom = new Date(from);
  const dateTo = new Date(to);
  if (isNaN(dateFrom) || isNaN(dateTo))
    throw new AppError("Invalid date format", 400);
  if (dateFrom > dateTo)
    throw new AppError("from must be before or equal to to", 400);

  // dateTo inclusive — set to end of day
  dateTo.setHours(23, 59, 59, 999);

  // Aggregate real revenue from successful Payments (source of truth).
  const matchStage = {
    status: "success",
    type: { $in: ["session", "reservation", "subscription"] },
    building: { $ne: null },
    createdAt: { $gte: dateFrom, $lte: dateTo },
  };
  if (buildingId) {
    matchStage.building = new mongoose.Types.ObjectId(buildingId);
  }

  const rows = await Payment.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: "$building",
        totalRevenue: { $sum: "$amount" },
        sessionCount: { $sum: 1 },
        cashAmount: { $sum: { $cond: [{ $eq: ["$method", "cash"] }, "$amount", 0] } },
        walletAmount: { $sum: { $cond: [{ $eq: ["$method", "wallet"] }, "$amount", 0] } },
        qrAmount: { $sum: { $cond: [{ $in: ["$method", ["qr", "payos", "card"]] }, "$amount", 0] } },
      },
    },
    {
      $lookup: {
        from: "buildings",
        localField: "_id",
        foreignField: "_id",
        as: "building",
      },
    },
    { $unwind: { path: "$building", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        buildingId: "$_id",
        buildingName: "$building.name",
        buildingCode: "$building.code",
        totalRevenue: 1,
        sessionCount: 1,
        cashAmount: 1,
        walletAmount: 1,
        qrAmount: 1,
      },
    },
    { $sort: { totalRevenue: -1 } },
  ]);

  const grandTotal = rows.reduce((sum, r) => sum + r.totalRevenue, 0);

  return { from: dateFrom, to: dateTo, items: rows, grandTotal };
};

module.exports = { getReport };
