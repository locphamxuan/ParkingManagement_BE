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
      enum: ['change_slot', 'change_vehicle', 'no_longer_needed', 'pricing_issue', 'other'],
      default: null,
    },
    cancelNote: {
      type: String,
      default: null,
    },
    // Các mốc ngày nhắc (7/5/3/1) đã gửi cho gói này, tránh gửi trùng.
    remindersSent: {
      type: [Number],
      default: [],
    },
    // Đánh dấu slot cố định đã được thu hồi sau khi hết grace.
    slotReleased: {
      type: Boolean,
      default: false,
    },
    // Mốc lần cuối gửi cảnh báo "gói đã hết hạn" trong thời gian grace (gửi tối đa 1 lần/ngày).
    lastGraceReminderAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

longTermSubscriptionSchema.index({ building: 1, status: 1 });

module.exports = mongoose.model(
  "LongTermSubscription",
  longTermSubscriptionSchema
);
module.exports.SUBSCRIPTION_STATUS = SUBSCRIPTION_STATUS;
