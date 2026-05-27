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

const validateReservationCheckIn = wrap((req) => {
  if (!req.params.code || !String(req.params.code).trim()) {
    throw new AppError('code is required', 400);
  }
  if (req.body.gate !== undefined && typeof req.body.gate !== 'string') {
    throw new AppError('gate must be a string', 400);
  }
});

const validateReservationExpire = wrap((req) => {
  if (!isValidObjectId(req.params.id)) {
    throw new AppError('id must be a valid ObjectId', 400);
  }
});

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

const INCIDENT_PAYMENT_METHODS = ['cash', 'wallet', 'qr'];
const INCIDENT_SEVERITIES      = ['medium', 'high', 'critical'];

/**
 * Validator mới cho POST /staff/incidents.
 * Chấp nhận cả payload FE mới { type, target, note, buildingId }
 * và payload cũ { incidentType } để backward-compat.
 */
const validateCreateIncident = wrap((req) => {
  const {
    type, incidentType,        // chấp nhận cả hai
    target, note,
    buildingId,
    severity,
    parkingSessionId, penaltyFee, paymentMethod,
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

  // Fields cho "lost ticket" flow (optional)
  if (parkingSessionId !== undefined && !isValidObjectId(parkingSessionId)) {
    throw new AppError('parkingSessionId must be a valid ObjectId', 400);
  }
  if (penaltyFee !== undefined) {
    const fee = Number(penaltyFee);
    if (!Number.isFinite(fee) || fee < 0) {
      throw new AppError('penaltyFee must be a non-negative number', 400);
    }
  }
  if (paymentMethod !== undefined && !INCIDENT_PAYMENT_METHODS.includes(paymentMethod)) {
    throw new AppError(`paymentMethod must be one of: ${INCIDENT_PAYMENT_METHODS.join(', ')}`, 400);
  }
});

/** @deprecated dùng validateCreateIncident thay thế */
const validateIncidentReport = validateCreateIncident;

// Fix #8: validate GET /staff/incidents query params
const INCIDENT_STATUSES_ALL = ['open', 'investigating', 'escalated', 'resolved', 'closed'];

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
  if (page !== undefined && (isNaN(Number(page)) || Number(page) < 1)) {
    throw new AppError('page must be a positive integer', 400);
  }
  if (limit !== undefined && (isNaN(Number(limit)) || Number(limit) < 1 || Number(limit) > 100)) {
    throw new AppError('limit must be between 1 and 100', 400);
  }
});

module.exports = {
  validateReservationCheckIn,
  validateReservationExpire,
  validateWalletTransaction,
  validateIncidentReport,
  validateCreateIncident,
  validateListIncidentsQuery,
};
