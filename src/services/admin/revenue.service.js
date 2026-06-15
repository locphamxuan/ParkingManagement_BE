const ShiftRevenue = require("../../models/finance/ShiftRevenue");
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

  const matchStage = { workDate: { $gte: dateFrom, $lte: dateTo } };
  if (buildingId) {
    matchStage.building = new mongoose.Types.ObjectId(buildingId);
  }

  const rows = await ShiftRevenue.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: "$building",
        totalRevenue: { $sum: "$totalRevenue" },
        sessionCount: { $sum: "$sessionCount" },
        cashAmount: { $sum: "$cashAmount" },
        walletAmount: { $sum: "$walletAmount" },
        qrAmount: { $sum: "$qrAmount" },
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
