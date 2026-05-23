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

const validateIncidentReport = wrap((req) => {
  const { incidentType, parkingSessionId, penaltyFee, paymentMethod } = req.body;

  if (!incidentType || !String(incidentType).trim()) {
    throw new AppError('incidentType is required', 400);
  }
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

module.exports = {
  validateReservationCheckIn,
  validateReservationExpire,
  validateWalletTransaction,
  validateIncidentReport,
};
