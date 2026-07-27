const mongoose = require('mongoose');
const AppError = require('../../../utils/AppError');
const { ParkingSession, Payment } = require('../../../models');
const { assertBuildingScope } = require('../../../utils/staffScope');
const payosService = require('../../payment/payos.service');
const {
  createPayosIntent,
  getPendingSessionIntent,
} = require('../../payment/paymentIntent.service');
const buildingWalletService = require('../../manager/buildingWallet.service');
const { finalizeSlotAfterCheckout } = require('../../shared/slotLifecycle.service');
const { calculateFee } = require('./helpers');

const initiatePayment = async (staffUser, sessionId) => {
  if (!sessionId) throw new AppError('sessionId is required', 400);

  const parkingSession = await ParkingSession.findById(sessionId)
    .populate('vehicleType', 'code name')
    .populate({ path: 'slot', select: 'floor', populate: { path: 'floor', select: '_id' } });
  if (!parkingSession) throw new AppError('Parking session not found', 404, 'SESSION_NOT_FOUND');

  assertBuildingScope(staffUser, parkingSession.building);
  if (parkingSession.status !== 'active') {
    throw new AppError('Session is not active', 400, 'SESSION_NOT_ACTIVE');
  }

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

      const exitTime = new Date();
      const parkingSession = await ParkingSession.findOneAndUpdate(
        { _id: payment.parkingSession, status: 'active' },
        {
          $set: {
            exitTime,
            status: 'completed',
            fee: payment.amount,
            paymentMethod: 'payos',
          },
        },
        { new: true, session: mongoSession },
      );

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

      await finalizeSlotAfterCheckout(parkingSession, mongoSession, exitTime);

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
  return { status: payosStatus.toLowerCase() || 'pending', settled: false };
};

module.exports = { initiatePayment, settleSessionPayment, verifySessionPayment };
