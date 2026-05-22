const mongoose = require("mongoose");

const AUDIT_SEVERITY = ["low", "medium", "high", "critical"];

const auditLogSchema = new mongoose.Schema(
  {
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    actorRole: { type: String, default: null },
    action: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
      uppercase: true,
      index: true,
    },
    targetTable: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    targetId: { type: String, default: null },
    building: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Building",
      default: null,
      index: true,
    },
    previousValue: { type: mongoose.Schema.Types.Mixed, default: null },
    newValue: { type: mongoose.Schema.Types.Mixed, default: null },
    severity: {
      type: String,
      enum: AUDIT_SEVERITY,
      default: "low",
    },
    description: { type: String, trim: true, maxlength: 500, default: "" },
  },
  { timestamps: true }
);

auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
module.exports.AUDIT_SEVERITY = AUDIT_SEVERITY;
