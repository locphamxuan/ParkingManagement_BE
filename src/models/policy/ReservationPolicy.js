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
    // % tổng phí ước tính được thu làm tiền CỌC khi đặt chỗ. Phần còn lại
    // (100 - depositPercent) hệ thống tự thu sau khi checkout.
    depositPercent: {
      type: Number,
      default: 15,
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
