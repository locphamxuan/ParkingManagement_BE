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
    // Cửa sổ đặt trước tối đa (số ngày) — manager quyết định được đặt trước bao xa.
    maxAdvanceDays: {
      type: Number,
      default: 7,
      min: 1,
    },
    // Thời lượng đỗ tối đa cho mỗi lượt đặt (số giờ) — manager giới hạn mỗi lượt.
    maxDurationHours: {
      type: Number,
      default: 24,
      min: 1,
    },
    // % phụ phí PHẠT áp lên phần đỗ quá giờ đặt (overstay). 0 = không phạt, chỉ
    // tính giá thường cho phần vượt.
    overstayPenaltyPercent: {
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
    // Số GIỜ trước startTime mà user còn được phép hủy. Sau mốc này không hủy được.
    // 0 = cho hủy bất kỳ lúc nào trước giờ đặt.
    cancellationCutoffHours: {
      type: Number,
      default: 0,
      min: 0,
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ReservationPolicy", reservationPolicySchema);
