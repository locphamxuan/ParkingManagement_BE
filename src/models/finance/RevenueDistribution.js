const mongoose = require("mongoose");

const revenueDistributionSchema = new mongoose.Schema(
  {
    building: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Building",
      required: true,
      index: true,
    },
    amount: { type: Number, required: true, min: 0 },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    distributedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    note: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

revenueDistributionSchema.index({ building: 1, createdAt: -1 });

module.exports = mongoose.model("RevenueDistribution", revenueDistributionSchema);
