const AuditLog = require("../models/log/AuditLog");

const writeAuditLog = async ({
  actor,
  action,
  targetTable,
  targetId = null,
  building = null,
  previousValue = null,
  newValue = null,
  severity = "low",
  description = "",
}) => {
  if (!actor?._id) return null;
  try {
    return await AuditLog.create({
      actor: actor._id,
      actorRole: actor.role || null,
      action,
      targetTable,
      targetId: targetId ? String(targetId) : null,
      building: building || null,
      previousValue,
      newValue,
      severity,
      description,
    });
  } catch (err) {
    console.error("[audit] failed to write log:", err.message);
    return null;
  }
};

module.exports = { writeAuditLog };

