const mongoose = require('mongoose');
const AppError = require('../../../utils/AppError');
const { Incident, ParkingSession, Payment } = require('../../../models');
const { assertBuildingScope } = require('../../../utils/staffScope');
const { normalizePlate, plateMatchRegex } = require('../../../utils/plate.util');
const { assertEvidenceImage } = require('../../../utils/evidence');
const payosService = require('../../payment/payos.service');
const {
  createPayosIntent,
  getPendingSessionIntent,
} = require('../../payment/paymentIntent.service');
const buildingWalletService = require('../../manager/buildingWallet.service');
const { calculateFee } = require('./helpers');
const { assertStaffHasActiveShift } = require('../../shared/entryAuthorization.service');
const { resolveOperationalGate } = require('../../shared/gateAuthorization.service');

const buildCheckoutDraft = async (staffUser, parkingSession, payload = {}) => {
  const activeStaffShift = await assertStaffHasActiveShift(
    staffUser._id,
    parkingSession.building,
  );
  const exitGate = await resolveOperationalGate({
    gateId: payload.exitGate || payload.gate || null,
    buildingId: parkingSession.building,
    operation: 'out',
    assignedGateId: activeStaffShift.gate?._id || activeStaffShift.gate || null,
  });
  const providedPlate = normalizePlate(payload.plateNumber || payload.exitPlateNumber);
  if (providedPlate && providedPlate !== normalizePlate(parkingSession.plateNumber) && !payload.bypassMismatch) {
    throw new AppError('Plate mismatch requires bypass confirmation', 409, 'PLATE_MISMATCH_WARNING');
  }

  return {
    exitPlateImage: assertEvidenceImage(payload.exitPlateImage, 'exitPlateImage', { required: true }),
    exitPortraitImage: assertEvidenceImage(payload.exitPortraitImage, 'exitPortraitImage', { required: true }),
    exitGate: exitGate?._id || null,
    verifiedBy: staffUser._id,
    staffShift: activeStaffShift._id,
    verifiedAt: new Date(),
    bypassMismatch: Boolean(payload.bypassMismatch),
  };
};

const hasPendingPenalty = async (parkingSession) => {
  const plate = plateMatchRegex(parkingSession.plateNumber) || parkingSession.plateNumber;
  return Incident.exists({
    building: parkingSession.building,
    violatorPlate: plate,
    status: 'penalty_pending',
  });
};

const getSessionPaymentIntent = async (staffUser, sessionId) => {
  const parkingSession = await ParkingSession.findById(sessionId);
  if (!parkingSession) throw new AppError('Parking session not found', 404, 'SESSION_NOT_FOUND');

  assertBuildingScope(staffUser, parkingSession.building);
  if (parkingSession.status !== 'active') {
    throw new AppError('Session is not active', 400, 'SESSION_NOT_ACTIVE');
  }

  let payment = await Payment.findOne({
    parkingSession: parkingSession._id,
    type: 'session',
    method: 'payos',
    status: { $in: ['pending', 'success'] },
  }).sort({ createdAt: -1 });
  if (!payment) return null;

  if (payment.status === 'pending') {
    await verifySessionPayment(staffUser, payment.payosOrderCode);
    payment = await Payment.findById(payment._id);
    if (!payment || (payment.status !== 'pending' && payment.status !== 'success')) return null;
  }

  return {
    status: payment.status,
    orderCode: payment.payosOrderCode,
    checkoutUrl: payment.payosCheckoutUrl,
    qrCode: payment.payosQrCode,
    amount: payment.amount,
    plateNumber: parkingSession.plateNumber,
  };
};

const initiatePayment = async (staffUser, sessionId, payload = {}) => {
  if (!sessionId) throw new AppError('sessionId is required', 400);

  const parkingSession = await ParkingSession.findById(sessionId)
    .populate('vehicleType', 'code name')
    .populate({ path: 'slot', select: 'floor', populate: { path: 'floor', select: '_id' } });
  if (!parkingSession) throw new AppError('Parking session not found', 404, 'SESSION_NOT_FOUND');

  assertBuildingScope(staffUser, parkingSession.building);
  if (parkingSession.status !== 'active') {
    throw new AppError('Session is not active', 400, 'SESSION_NOT_ACTIVE');
  }
  if (parkingSession.paymentMethod === 'long_term') {
    throw new AppError(
      'PayOS QR is not supported for long-term package checkout. Use the staffed checkout flow so overage and penalties are collected correctly.',
      409,
      'LONG_TERM_PAYOS_UNSUPPORTED',
    );
  }
  const paidIntent = await Payment.exists({
    parkingSession: parkingSession._id,
    type: 'session',
    method: 'payos',
    status: 'success',
  });
  if (paidIntent) {
    throw new AppError(
      'This PayOS payment has already been received. Complete the verified checkout instead of creating another QR.',
      409,
      'PAYOS_PAYMENT_ALREADY_RECEIVED',
    );
  }
  if (await hasPendingPenalty(parkingSession)) {
    throw new AppError(
      'This vehicle has a pending penalty. Collect it through the staffed checkout flow so the full amount is recorded.',
      409,
      'PENDING_PENALTY_REQUIRES_MANUAL_PAYMENT',
    );
  }

  const checkoutDraft = await buildCheckoutDraft(staffUser, parkingSession, payload);

  const fee = await calculateFee(parkingSession);
  if (!fee || fee <= 0) {
    throw new AppError(
      'This session has no fee due under its current package.',
      400,
      'NO_FEE_DUE',
    );
  }

  let intent = await getPendingSessionIntent(parkingSession._id);
  if (!intent) {
    try {
      intent = await createPayosIntent({
        paymentData: {
          building: parkingSession.building,
          parkingSession: parkingSession._id,
          type: 'session',
          amount: fee,
          user: parkingSession.user || null,
          staff: staffUser._id,
          note: 'Parking fee via PayOS QR',
          checkoutDraft,
        },
        linkData: {
          amount: fee,
          description: 'Phi giu xe PBMS',
        },
      });
    } catch (error) {
      if (error?.code !== 11000 || !error?.keyPattern?.parkingSession) throw error;
      intent = await getPendingSessionIntent(parkingSession._id);
      if (!intent) throw error;
    }
  }

  if (!intent.payment.checkoutDraft?.verifiedAt) {
    await Payment.updateOne(
      { _id: intent.payment._id, status: 'pending' },
      { $set: { checkoutDraft } },
    );
  }

  return {
    checkoutUrl: intent.checkoutUrl,
    qrCode: intent.qrCode,
    orderCode: intent.orderCode,
    amount: intent.amount,
    plateNumber: parkingSession.plateNumber,
    entryTime: parkingSession.entryTime,
  };
};

const settleSessionPayment = async (orderCode) => {
  const oc = Number(orderCode);
  const mongoSession = await mongoose.startSession();
  let result = { settled: false, status: 'already_processed' };

  try {
    await mongoSession.withTransaction(async () => {
      const payment = await Payment.findOne({
        payosOrderCode: oc,
        type: 'session',
        status: 'pending',
      }).session(mongoSession);
      if (!payment) return;

      const parkingSession = await ParkingSession.findOne({
        _id: payment.parkingSession,
        status: 'active',
      }).session(mongoSession);

      if (!parkingSession) {
        await Payment.updateOne(
          { _id: payment._id, status: 'pending' },
          {
            $set: {
              status: 'reconciliation_required',
              note: `${payment.note || ''} | session_not_active_at_settlement`.trim(),
            },
          },
          { session: mongoSession },
        );
        result = { settled: false, status: 'reconciliation_required' };
        return;
      }

      const claimedPayment = await Payment.findOneAndUpdate(
        { _id: payment._id, status: 'pending' },
        { $set: { status: 'success' } },
        { new: true, session: mongoSession },
      );
      if (!claimedPayment) {
        throw new AppError('Payment was already processed', 409, 'PAYMENT_ALREADY_PROCESSED');
      }

      if (payment.amount > 0) {
        await buildingWalletService.credit(
          parkingSession.building,
          payment.amount,
          'parking_fee',
          payment._id,
          mongoSession,
        );
      }

      result = { settled: true, status: 'success' };
    });
    return result;
  } catch (error) {
    if (error?.code === 11000) {
      return { settled: false, status: 'already_processed' };
    }
    throw error;
  } finally {
    mongoSession.endSession();
  }
};

const verifySessionPayment = async (staffUser, orderCode) => {
  const oc = Number(orderCode);
  if (!oc) throw new AppError('Invalid orderCode', 400);

  const payment = await Payment.findOne({ payosOrderCode: oc, type: 'session' });
  if (!payment) throw new AppError('Payment order not found', 404);
  assertBuildingScope(staffUser, payment.building);

  if (payment.status === 'success') {
    return { status: 'success', settled: false };
  }
  if (payment.status === 'reconciliation_required') {
    return { status: 'reconciliation_required', settled: false };
  }

  let info;
  try {
    info = await payosService.getPaymentLink(oc);
  } catch (error) {
    throw new AppError(`Could not verify payment with PayOS: ${error.message}`, 502);
  }

  const payosStatus = String(info?.status || '').toUpperCase();
  if (payosStatus === 'PAID') {
    const settlement = await settleSessionPayment(oc);
    return { status: settlement.status, settled: settlement.settled };
  }
  if (payosStatus === 'EXPIRED' || payosStatus === 'CANCELLED') {
    await Payment.updateOne(
      { _id: payment._id, status: 'pending' },
      { $set: { status: 'failed', note: `${payment.note || ''} | payos_link_${payosStatus.toLowerCase()}`.trim() } },
    );
  }
  return { status: payosStatus.toLowerCase() || 'pending', settled: false };
};

module.exports = { initiatePayment, getSessionPaymentIntent, settleSessionPayment, verifySessionPayment };
