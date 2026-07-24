const AppError = require('../utils/AppError');
const mongoose = require('mongoose');

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const wrap = (fn) => (req, _res, next) => {
  try {
    fn(req);
    next();
  } catch (err) {
    next(err);
  }
};

const validateWalletTransaction = wrap((req) => {
  const { sessionId, userId, amount } = req.body;

  if (!sessionId && !userId) {
    throw new AppError('sessionId or userId is required', 400);
  }
  if (sessionId && !isValidObjectId(sessionId)) {
    throw new AppError('sessionId must be a valid ObjectId', 400);
  }
  if (userId && !isValidObjectId(userId)) {
    throw new AppError('userId must be a valid ObjectId', 400);
  }

  const amt = Number(amount);
  if (!amount || !Number.isFinite(amt) || amt <= 0) {
    throw new AppError('amount must be a positive number', 400);
  }
});

const INCIDENT_SEVERITIES = ['medium', 'high', 'critical'];
// Staff chỉ được tạo incident ở 2 trạng thái này — 'escalated' do BE tự set khi user
// report biển lạ, 'penalty_pending' chỉ do action='penalize_violator' (manager) set;
// cho phép client set tay 2 status đó lúc TẠO sẽ tạo ra incident "ma" (escalated giả
// hoặc penalty_pending không có penaltyFee/penaltyApprovedBy).
const INCIDENT_CREATE_STATUSES = ['open', 'resolved'];

/**
 * Validator mới cho POST /staff/incidents.
 * Chấp nhận cả payload FE mới { type, target, note, buildingId }
 * và payload cũ { incidentType } để backward-compat.
 * Không nhận penaltyFee/paymentMethod ở đây — staff không được set phí phạt khi
 * tạo sự cố (chỉ manager mới áp phí phạt được, qua PATCH resolve).
 */
const validateCreateIncident = wrap((req) => {
  const {
    type, incidentType,        // chấp nhận cả hai
    target, note,
    buildingId,
    severity,
    parkingSessionId,
    status,
  } = req.body;

  const resolvedType = String(type || incidentType || '').trim();
  if (!resolvedType) {
    throw new AppError('type is required', 400, 'INCIDENT_TYPE_REQUIRED');
  }
  if (resolvedType.length > 150) {
    throw new AppError('type must be at most 150 characters', 400);
  }

  if (target !== undefined && String(target).length > 200) {
    throw new AppError('target must be at most 200 characters', 400);
  }
  if (note !== undefined && String(note).length > 1000) {
    throw new AppError('note must be at most 1000 characters', 400);
  }

  if (buildingId !== undefined && !isValidObjectId(buildingId)) {
    throw new AppError('buildingId must be a valid ObjectId', 400);
  }

  if (severity !== undefined && !INCIDENT_SEVERITIES.includes(severity)) {
    throw new AppError(`severity must be one of: ${INCIDENT_SEVERITIES.join(', ')}`, 400);
  }

  if (parkingSessionId !== undefined && !isValidObjectId(parkingSessionId)) {
    throw new AppError('parkingSessionId must be a valid ObjectId', 400);
  }

  if (status !== undefined && !INCIDENT_CREATE_STATUSES.includes(status)) {
    throw new AppError(`status must be one of: ${INCIDENT_CREATE_STATUSES.join(', ')}`, 400, 'INVALID_STATUS');
  }
});

// Fix #8: validate GET /staff/incidents query params
const INCIDENT_STATUSES_ALL = ['open', 'investigating', 'escalated', 'penalty_pending', 'resolved', 'closed'];

const validateListIncidentsQuery = wrap((req) => {
  const { buildingId, status, severity, page, limit } = req.query;

  if (buildingId !== undefined && !isValidObjectId(buildingId)) {
    throw new AppError('buildingId must be a valid ObjectId', 400);
  }
  if (status !== undefined && !INCIDENT_STATUSES_ALL.includes(status)) {
    throw new AppError(`status must be one of: ${INCIDENT_STATUSES_ALL.join(', ')}`, 400);
  }
  if (severity !== undefined && !INCIDENT_SEVERITIES.includes(severity)) {
    throw new AppError(`severity must be one of: ${INCIDENT_SEVERITIES.join(', ')}`, 400);
  }
  if (page !== undefined && (Number.isNaN(Number(page)) || Number(page) < 1)) {
    throw new AppError('page must be a positive integer', 400);
  }
  if (limit !== undefined && (Number.isNaN(Number(limit)) || Number(limit) < 1 || Number(limit) > 100)) {
    throw new AppError('limit must be between 1 and 100', 400);
  }
});

module.exports = {
  validateWalletTransaction,
  validateCreateIncident,
  validateListIncidentsQuery,
};
