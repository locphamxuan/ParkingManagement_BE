const mongoose = require("mongoose");

/**
 * DailyRevenueSettlement
 * Marks that a building's daily revenue (parking_fee + reservation_fee) has been
 * auto-settled: 30% transferred from BuildingWallet → SystemWallet (admin).
 * The unique (building, date) index guarantees each day is settled exactly once.
 */
const dailyRevenueSettlementSchema = new mongoose.Schema(
  {
    building: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Building",
      required: true,
      index: true,
    },
    // Local-server day key, e.g. "2026-05-29"
    date: { type: String, required: true },
    // Total building revenue for that day
    revenue: { type: Number, default: 0, min: 0 },
    // 30% target = floor(revenue * 0.3)
    targetAmount: { type: Number, default: 0, min: 0 },
    // Amount actually moved (min of target and available balance)
    transferredAmount: { type: Number, default: 0, min: 0 },
    systemBalanceAfter: { type: Number, default: 0, min: 0 },
    note: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

dailyRevenueSettlementSchema.index({ building: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("DailyRevenueSettlement", dailyRevenueSettlementSchema);
