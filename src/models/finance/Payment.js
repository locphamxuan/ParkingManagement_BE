const mongoose = require("mongoose");

const PAYMENT_STATUS = [
  "pending",
  "success",
  "failed",
  "refunded",
  "reconciliation_required",
];
// "reservation" là loại LỊCH SỬ: tính năng đặt chỗ theo giờ đã bị gỡ khỏi hệ thống
// và không còn code path nào tạo Payment loại này. Giữ trong enum để các bản ghi tài
// chính CŨ vẫn đọc/aggregate được (xoá enum sẽ làm validate + report dữ liệu cũ hỏng).
// Muốn gỡ hẳn: xem src/scripts/auditLegacyReservationPayments.js.
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
    checkoutDraft: {
      exitPlateImage: { type: String, default: null },
      exitPortraitImage: { type: String, default: null },
      exitGate: { type: mongoose.Schema.Types.ObjectId, ref: 'Gate', default: null },
      verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      staffShift: { type: mongoose.Schema.Types.ObjectId, ref: 'StaffShift', default: null },
      verifiedAt: { type: Date, default: null },
      bypassMismatch: { type: Boolean, default: false },
    },
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

// MỘT phiên gửi xe chỉ có TỐI ĐA MỘT ý định thanh toán PayOS còn sống (pending) hoặc
// đã thu (success). Hai request tạo QR song song đều thấy "chưa có pending" rồi cùng
// tạo link → khách quét cả hai → ví tòa được cộng 2 lần. Unique index này là chốt
// chặn ở tầng DB (check-rồi-tạo ở service KHÔNG đủ). Bản ghi failed/refunded/
// reconciliation_required không nằm trong index nên QR hỏng vẫn thay thế được.
paymentSchema.index(
  { parkingSession: 1 },
  {
    unique: true,
    name: 'uniq_live_payos_session_intent',
    // Created only by the audited index CLI; other model indexes still auto-build.
    _autoIndex: false,
    partialFilterExpression: {
      type: 'session',
      method: 'payos',
      status: { $in: ['pending', 'success'] },
    },
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
