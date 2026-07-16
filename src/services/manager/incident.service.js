const mongoose = require('mongoose');
const { Incident } = require('../../models');
const AppError = require('../../utils/AppError');
const { ensureManagerOwnsBuilding } = require('../../utils/managerScope');
const { applyIncidentAction } = require('../shared/incidentResolve.service');

const { INCIDENT_STATUS } = Incident;

const POPULATE_BUILDING = { path: 'building', select: '_id code name' };
const POPULATE_SLOT = { path: 'slot', select: '_id code' };
const POPULATE_REPORTER = { path: 'reportedBy', select: '_id fullName email' };
const POPULATE_RESOLVER = { path: 'resolvedBy', select: '_id fullName email' };

const list = async (user, buildingId, query = {}) => {
  ensureManagerOwnsBuilding(user, buildingId);

  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const filter = { building: buildingId };
  if (query.status) {
    if (!INCIDENT_STATUS.includes(query.status)) {
      throw new AppError(`status must be one of: ${INCIDENT_STATUS.join(', ')}`, 400);
    }
    filter.status = query.status;
  }
  if (query.severity) filter.severity = query.severity;

  const [items, total] = await Promise.all([
    Incident.find(filter)
      .populate(POPULATE_BUILDING)
      .populate(POPULATE_SLOT)
      .populate(POPULATE_REPORTER)
      .populate(POPULATE_RESOLVER)
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(limit),
    Incident.countDocuments(filter),
  ]);

  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

/**
 * Manager xử lý sự cố (đổi trạng thái / ghi chú / xử lý người vi phạm).
 */
const resolve = async (user, buildingId, id, payload = {}) => {
  ensureManagerOwnsBuilding(user, buildingId);
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError('Invalid incident id', 400);
  }
  const incident = await Incident.findOne({ _id: id, building: buildingId });
  if (!incident) throw new AppError('Incident not found', 404);

  return applyIncidentAction(user, incident, payload);
};

module.exports = { list, resolve };
