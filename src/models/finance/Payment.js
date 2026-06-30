const mongoose = require("mongoose");

const PAYMENT_STATUS = ["pending", "success", "failed", "refunded"];
const PAYMENT_TYPES = ["session", "reservation", "subscription", "refund", "topup", "cancellation_fee"];
const PAYMENT_METHODS = ["cash", "wallet", "qr", "card", "payos"];

const paymentSchema = new mongoose.Schema(
  {
    building: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Building",
      required: false,
      default: null,
      index: true,
    },
    type: {
      type: String,
      enum: PAYMENT_TYPES,
      required: true,
    },
    method: {
      type: String,
      enum: PAYMENT_METHODS,
      required: true,
    },
    amount: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: PAYMENT_STATUS,
      default: "pending",
    },
    parkingSession: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ParkingSession",
      default: null,
    },
    reservation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Reservation",
      default: null,
    },
    subscription: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LongTermSubscription",
      default: null,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    staff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    note: { type: String, trim: true, default: "" },
    // PayOS fields
    payosOrderCode: { type: Number, default: null, index: true },
    payosPaymentLinkId: { type: String, default: null },
  },
  { timestamps: true }
);

paymentSchema.index({ building: 1, createdAt: -1 });
paymentSchema.index({ reservation: 1, type: 1, status: 1 }); // revenue aggregate per reservation
paymentSchema.index({ parkingSession: 1 });                  // session payment lookup
paymentSchema.index({ subscription: 1 });                    // subscription payment lookup
paymentSchema.index({ user: 1, createdAt: -1 });             // user transaction history

module.exports = mongoose.model("Payment", paymentSchema);
module.exports.PAYMENT_STATUS = PAYMENT_STATUS;
module.exports.PAYMENT_TYPES = PAYMENT_TYPES;
module.exports.PAYMENT_METHODS = PAYMENT_METHODS;
