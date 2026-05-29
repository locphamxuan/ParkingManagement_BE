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
    maxHoldMinutes: {
      type: Number,
      default: 30,
      min: 0,
    },
    bookingFee: {
      type: Number,
      default: 0,
      min: 0,
    },
    refundPercent: {
      type: Number,
      default: 80,
      min: 0,
      max: 100,
    },
    // minAdvanceMinutes và maxAdvanceHours đã bỏ —
    // khách tự chọn thời gian bất kỳ, hệ thống tính phí tự động.
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ReservationPolicy", reservationPolicySchema);
