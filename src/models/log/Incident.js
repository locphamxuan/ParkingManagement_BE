const mongoose = require('mongoose');

const INCIDENT_SEVERITY = ['medium', 'high', 'critical'];
const INCIDENT_STATUS  = ['open', 'investigating', 'escalated', 'resolved', 'closed'];

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
    // Tham chiếu phiên đỗ xe nếu sự cố liên quan (mất vé, xe quá hạn…)
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
