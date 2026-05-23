const AppError = require('./AppError');
const { AuditLog } = require('../models');

const toIdString = (value) => `${value?._id || value}`;

const assignedBuildingIds = (user) =>
  Array.isArray(user?.assignedBuildings)
    ? user.assignedBuildings.map((item) => toIdString(item))
    : [];

const assertBuildingScope = (user, buildingId) => {
  const allowed = assignedBuildingIds(user);
  if (allowed.length === 0) {
    throw new AppError('No assigned buildings for this staff user', 403, 'FORBIDDEN_BUILDING_SCOPE');
  }
  if (buildingId && !allowed.includes(toIdString(buildingId))) {
    throw new AppError('Forbidden for this building', 403, 'FORBIDDEN_BUILDING_SCOPE');
  }
  return allowed;
};

const logAudit = async (session, payload) =>
  AuditLog.create(
    [{
      actor: payload.actor,
      actorRole: payload.actorRole || null,
      action: payload.action,
      targetTable: payload.entityType,
      targetId: payload.entityId || null,
      building: payload.building || null,
      previousValue: payload.before || null,
      newValue: payload.after || null,
      severity: payload.severity || 'low',
      description: payload.description || '',
    }],
    { session },
  );

module.exports = { toIdString, assignedBuildingIds, assertBuildingScope, logAudit };
