const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true, trim: true },
    entityType: { type: String, required: true, trim: true },
    entityId: { type: String, default: null },
    building: { type: mongoose.Schema.Types.ObjectId, ref: 'Building', default: null },
    before: { type: Object, default: null },
    after: { type: Object, default: null },
    metadata: { type: Object, default: {} },
  },
  { timestamps: true }
);

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

module.exports = AuditLog;
