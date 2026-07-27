const mongoose = require('mongoose');

const INCIDENT_SEVERITY = ['medium', 'high', 'critical'];
// 'penalty_pending': manager đã duyệt số tiền phạt (violatorPlate + penaltyFee) nhưng
// CHƯA thu — chờ staff checkout xe vi phạm (lúc đó phí phạt tự cộng vào, xem
// shared/incidentResolve.service.js::settlePendingPenaltyAtCheckout).
const INCIDENT_STATUS  = ['open', 'investigating', 'escalated', 'penalty_pending', 'resolved', 'closed'];

const incidentSchema = new mongoose.Schema(
  {
    // Fix #7: `unique: true` đã tạo index ngầm, không cần `index: true`
    code: {
      type: String,
      unique: true,
      trim: true,
      uppercase: true,
    },
    type: {
      type: String,
      required: [true, 'type is required'],
      trim: true,
      maxlength: 150,
    },
    // Biển số / cổng / khu vực liên quan
    target: { type: String, trim: true, maxlength: 200, default: '' },
    note: { type: String, trim: true, maxlength: 1000, default: '' },
    building: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Building',
      default: null,
      index: true,
    },
    // Ô đỗ liên quan (vd user báo bị chiếm slot cố định của gói).
    slot: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ParkingSlot',
      default: null,
    },
    // Biển số PHƯƠNG TIỆN VI PHẠM (khi sự cố là "có người đậu vào slot của tôi").
    violatorPlate: { type: String, trim: true, uppercase: true, maxlength: 20, default: '' },
    // Biển vi phạm có account (subscription/phiên gắn user) trong building hay không —
    // null = không áp dụng (không có violatorPlate). false → incident tự escalate cho manager.
    plateAccountFound: { type: Boolean, default: null },
    // Ghi chú xử lý của staff/manager khi giải quyết sự cố.
    resolutionNote: { type: String, trim: true, maxlength: 1000, default: '' },
    // Số tiền phạt (chỉ manager duyệt được) — staff thu thật lúc checkout xe vi phạm.
    penaltyFee: { type: Number, default: null, min: 0 },
    // Manager đã duyệt phí phạt này (khác resolvedBy — người thực thu là staff lúc checkout).
    penaltyApprovedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    // Phương thức thanh toán THỰC TẾ đã thu (staff/khách chọn lúc checkout).
    paymentMethod: { type: String, trim: true, default: null },
    payment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
      default: null,
    },
    severity: {
      type: String,
      enum: INCIDENT_SEVERITY,
      default: 'medium',
    },
    status: {
      type: String,
      enum: INCIDENT_STATUS,
      default: 'open',
    },
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Tham chiếu phiên đỗ xe nếu sự cố liên quan (xe quá hạn, tranh chấp phí…)
    parkingSession: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ParkingSession',
      default: null,
    },
    // Nhân viên / manager xử lý sau cùng
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

incidentSchema.index({ building: 1, createdAt: -1 });
incidentSchema.index({ status: 1 });
incidentSchema.index({ reportedBy: 1 });

module.exports = mongoose.model('Incident', incidentSchema);
module.exports.INCIDENT_SEVERITY = INCIDENT_SEVERITY;
module.exports.INCIDENT_STATUS   = INCIDENT_STATUS;
