const mongoose = require("mongoose");

const PAYMENT_STATUS = [
  "pending",
  "success",
  "failed",
  "refunded",
  "reconciliation_required",
];
const PAYMENT_TYPES = ["session", "reservation", "subscription", "penalty", "refund", "topup", "cancellation_fee"];
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
    // Reports recognize money on settlement, not merely when an intent/receipt
    // was created (cash may be handed over on a later day).
    settledAt: { type: Date, default: null, index: true },
    parkingSession: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ParkingSession",
      default: null,
    },
    subscription: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LongTermSubscription",
      default: null,
    },
    incident: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Incident",
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
    payosOrderCode: { type: Number, default: null },
    payosPaymentLinkId: { type: String, default: null },
    payosCheckoutUrl: { type: String, default: null },
    payosQrCode: { type: String, default: null },
  },
  { timestamps: true }
);

paymentSchema.index({ building: 1, createdAt: -1 });
paymentSchema.index({ parkingSession: 1 });                  // session payment lookup
paymentSchema.index({ subscription: 1 });                    // subscription payment lookup
paymentSchema.index({ user: 1, createdAt: -1 });             // user transaction history
paymentSchema.index(
  { payosOrderCode: 1 },
  {
    unique: true,
    name: 'uniq_payos_order_code',
    partialFilterExpression: { payosOrderCode: { $type: 'number' } },
  },
);

paymentSchema.pre("findOneAndUpdate", function setSettlementTimeOnUpdate(next) {
  const update = this.getUpdate() || {};
  const nextStatus = update.$set?.status ?? update.status;
  const hasSettledAt = update.$set?.settledAt !== undefined || update.settledAt !== undefined;
  if (nextStatus === "success" && !hasSettledAt) {
    if (update.$set) update.$set.settledAt = new Date();
    else update.settledAt = new Date();
    this.setUpdate(update);
  }
  next();
});
module.exports = mongoose.model("Payment", paymentSchema);
module.exports.PAYMENT_STATUS = PAYMENT_STATUS;
module.exports.PAYMENT_TYPES = PAYMENT_TYPES;
module.exports.PAYMENT_METHODS = PAYMENT_METHODS;
