const mongoose = require("mongoose");

const reservationPolicySchema = new mongoose.Schema(
  {
    building: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Building",
      required: true,
      unique: true,
      index: true,
    },
    reservableRatio: {
      type: Number,
      default: 0.3,
      min: 0,
      max: 1,
    },
    maxHoldMinutes: {
      type: Number,
      default: 30,
      min: 0,
    },
    refundPercent: {
      type: Number,
      default: 80,
      min: 0,
      max: 100,
    },
    minAdvanceMinutes: { type: Number, default: 15, min: 0 },
    maxAdvanceHours: { type: Number, default: 72, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ReservationPolicy", reservationPolicySchema);
