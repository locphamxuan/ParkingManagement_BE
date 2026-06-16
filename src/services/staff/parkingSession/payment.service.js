const mongoose = require('mongoose');
const AppError = require('../../../utils/AppError');
const { ParkingSession, ParkingSlot, Payment } = require('../../../models');
const { assertBuildingScope } = require('../../../utils/staffScope');
const payosService = require('../../payment/payos.service');
const buildingWalletService = require('../../manager/buildingWallet.service');
const { calculateFee } = require('./helpers');

/**
 * Tạo PayOS payment link để thu phí gửi xe trực tiếp.
 * Staff nhận checkoutUrl + qrCode → hiển thị QR cho khách quét.
 * Session giữ nguyên "active" cho đến khi webhook xác nhận thanh toán.
 */
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
    // Gói dài hạn còn trong hạn mức giờ/ngày → không có phí để thu qua PayOS.
    throw new AppError('Phiên này không có phí cần thu (miễn phí theo gói).', 400, 'NO_FEE_DUE');
  }
  const orderCode = payosService.generateOrderCode();

  const { checkoutUrl, qrCode, paymentLinkId } = await payosService.createPaymentLink({
    orderCode,
    amount: fee,
    description: 'Phi giu xe PBMS',
  });

  // Persist pending Payment — webhook will complete the session
  await Payment.create({
    building: parkingSession.building,
    parkingSession: parkingSession._id,
    type: 'session',
    method: 'payos',
    amount: fee,
    status: 'pending',
    user: parkingSession.user || null,
    staff: staffUser._id,
    payosOrderCode: orderCode,
    payosPaymentLinkId: paymentLinkId,
    note: 'Parking fee via PayOS QR',
  });

  return {
    checkoutUrl,
    qrCode,
    orderCode,
    amount: fee,
    plateNumber: parkingSession.plateNumber,
    entryTime: parkingSession.entryTime,
  };
};

/* ─────────────────────────────────────────────
   settleSessionPayment
   Complete a parking session paid via PayOS (bank transfer / VietQR) — race-safe
   & idempotent. Shared by the PayOS webhook and the manual verify endpoint.
   Atomically flips the pending Payment → success so only one caller completes the
   session + credits the manager (building) wallet; never double-credits.
───────────────────────────────────────────── */
const settleSessionPayment = async (orderCode) => {
  const oc = Number(orderCode);
  const mongoSession = await mongoose.startSession();
  let result = { settled: false, status: 'already_processed' };
  try {
    await mongoSession.withTransaction(async () => {
      const payment = await Payment.findOneAndUpdate(
        { payosOrderCode: oc, type: 'session', status: 'pending' },
        { status: 'success' },
        { new: true, session: mongoSession },
      );
      if (!payment) return; // already processed / unknown → no-op

      const ps = await ParkingSession.findById(payment.parkingSession).session(mongoSession);
      if (!ps) throw new AppError('Parking session not found', 404, 'SESSION_NOT_FOUND');

      if (ps.status === 'active') {
        ps.exitTime = new Date();
        ps.status = 'completed';
        ps.fee = payment.amount;
        ps.paymentMethod = 'payos';
        await ps.save({ session: mongoSession });

        if (ps.slot) {
          const slot = await ParkingSlot.findById(ps.slot).session(mongoSession);
          if (slot && slot.status !== 'maintenance') {
            slot.status = 'available';
            await slot.save({ session: mongoSession });
          }
        }

        // Credit the manager (building) wallet — same as the cash path.
        if (payment.amount > 0) {
          await buildingWalletService.credit(
            ps.building, payment.amount, 'parking_fee', payment._id, mongoSession,
          );
        }
      }

      result = { settled: true, status: 'success' };
    });
    return result;
  } catch (err) {
    if (err && err.code === 11000) return { settled: false, status: 'already_processed' };
    throw err;
  } finally {
    mongoSession.endSession();
  }
};

/* ─────────────────────────────────────────────
   verifySessionPayment
   Reconcile a session payment with PayOS — fallback when the webhook never
   reaches the server. Credits the wallet (via settleSessionPayment) if PAID.
───────────────────────────────────────────── */
const verifySessionPayment = async (staffUser, orderCode) => {
  const oc = Number(orderCode);
  if (!oc) throw new AppError('Invalid orderCode', 400);

  const payment = await Payment.findOne({ payosOrderCode: oc, type: 'session' });
  if (!payment) throw new AppError('Payment order not found', 404);
  assertBuildingScope(staffUser, payment.building);

  if (payment.status === 'success') {
    return { status: 'success', settled: false };
  }

  let info;
  try {
    info = await payosService.getPaymentLink(oc);
  } catch (err) {
    throw new AppError(`Could not verify payment with PayOS: ${err.message}`, 502);
  }

  const payosStatus = String(info?.status || '').toUpperCase();
  if (payosStatus === 'PAID') {
    const r = await settleSessionPayment(oc);
    return { status: 'success', settled: r.settled };
  }
  return { status: payosStatus.toLowerCase() || 'pending', settled: false };
};

module.exports = { initiatePayment, settleSessionPayment, verifySessionPayment };
