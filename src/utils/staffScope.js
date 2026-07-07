const AppError = require('./AppError');
const { AuditLog } = require('../models');

const OBJECTID_RE = /^[0-9a-fA-F]{24}$/;

const toIdString = (value) => `${value?._id || value}`;

const assignedBuildingIds = (user) =>
  Array.isArray(user?.assignedBuildings)
    ? user.assignedBuildings
        .filter(Boolean)
        .map((item) => toIdString(item))
        // Loại bỏ giá trị không phải ObjectId hợp lệ (null, "null", "undefined"…)
        // để tránh Mongoose CastError khi dùng $in query.
        .filter((id) => OBJECTID_RE.test(id))
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

/**
 * Returns the first assigned building ID for the given staff user.
 * Throws 403 if the user has no assigned buildings.
 */
const ensureStaffHasBuilding = (user) => {
  const ids = assignedBuildingIds(user);
  if (ids.length === 0) {
    throw new AppError('No assigned buildings for this staff user', 403, 'FORBIDDEN_BUILDING_SCOPE');
  }
  return ids[0];
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

module.exports = { toIdString, assignedBuildingIds, assertBuildingScope, ensureStaffHasBuilding, logAudit };
