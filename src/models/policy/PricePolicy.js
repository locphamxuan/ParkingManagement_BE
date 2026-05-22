const mongoose = require("mongoose");

const pricePolicySchema = new mongoose.Schema(
  {
    building: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Building",
      required: true,
      index: true,
    },
    vehicleType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VehicleType",
      required: true,
    },
    name: {
      type: String,
      required: [true, "Price policy name is required"],
      trim: true,
      maxlength: 120,
    },
    hourlyRate: {
      type: Number,
      required: [true, "hourlyRate is required"],
      min: 0,
    },
    dailyCap: { type: Number, default: null, min: 0 },
    minRate: { type: Number, default: 0, min: 0 },
    maxRate: { type: Number, default: null, min: 0 },
    timeWindow: {
      from: { type: String, default: "00:00" },
      to: { type: String, default: "23:59" },
    },
    effectiveFrom: { type: Date, default: () => new Date() },
    effectiveTo: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

pricePolicySchema.index({ building: 1, vehicleType: 1, isActive: 1 });

module.exports = mongoose.model("PricePolicy", pricePolicySchema);
