const mongoose = require("mongoose");

const SUBSCRIPTION_STATUS = ["pending", "active", "expired", "cancelled"];

const longTermSubscriptionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    package: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LongTermPackage",
      required: true,
    },
    building: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Building",
      required: true,
      index: true,
    },
    plateNumber: {
      type: String,
      required: [true, "plateNumber is required"],
      uppercase: true,
      trim: true,
      maxlength: 20,
    },
    // Slot cố định (tùy chọn) do user chọn lúc mua gói. Giữ riêng cả kỳ: slot ở
    // trạng thái 'reserved' suốt thời hạn; check-in → 'occupied', check-out → 'reserved'.
    // null = gói floating (staff gán slot trống lúc check-in).
    slot: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ParkingSlot",
      default: null,
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: {
      type: String,
      enum: SUBSCRIPTION_STATUS,
      default: "active",
    },
    cancelReason: {
      type: String,
      enum: ['change_slot', 'change_vehicle', 'no_longer_needed', 'pricing_issue', 'other', 'manager_cancelled'],
      default: null,
    },
    cancelNote: {
      type: String,
      default: null,
    },
    // Snapshot % và số tiền đã hoàn lúc hủy (theo ReservationPolicy tại thời điểm đó) —
    // để hiển thị lại chính xác trong lịch sử, tránh tính lại sai nếu policy đổi sau này.
    refundPercent: {
      type: Number,
      default: null,
    },
    refundAmount: {
      type: Number,
      default: null,
    },
    // Các mốc ngày nhắc (7/5/3/1) đã gửi cho gói này, tránh gửi trùng.
    remindersSent: {
      type: [Number],
      default: [],
    },
  },
  { timestamps: true }
);

longTermSubscriptionSchema.index({ building: 1, status: 1 });

// Ràng buộc DB-level: 1 biển số chỉ được có DUY NHẤT 1 gói đang 'active' tại một thời điểm.
// Partial index nên các gói đã 'cancelled'/'expired'/'pending' không bị tính → user vẫn
// có thể mua lại gói mới sau khi hủy. plateNumber đã được normalize canonical trước khi lưu.
longTermSubscriptionSchema.index(
  { plateNumber: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } },
);

module.exports = mongoose.model(
  "LongTermSubscription",
  longTermSubscriptionSchema
);
module.exports.SUBSCRIPTION_STATUS = SUBSCRIPTION_STATUS;
