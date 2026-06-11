/**
 * webhook.service.js
 * Handles PayOS webhook events after signature verification.
 *
 * PayOS sends a POST with JSON body when a payment completes.
 * We verify the signature via payos.webhooks.verify(), then look up
 * the pending Payment record by payosOrderCode to know what to do.
 *
 * Supported flows:
 *  - type='topup'   → credit user.walletBalance + create WalletTransaction
 *  - type='session' → mark ParkingSession completed + free slot
 */

const mongoose = require('mongoose');
const payosService = require('./payos.service');
const { Payment } = require('../../models');
const Reservation = require('../../models/operations/Reservation');
const buildingWalletService = require('../manager/buildingWallet.service');
const walletService = require('../user/wallet.service');
const buildingWalletTopupService = require('../manager/buildingWalletTopup.service');
const parkingSessionService = require('../staff/parkingSession.service');
const AppError = require('../../utils/AppError');

/* ─────────────────────────────────────────────
   Top-up   → walletService.settleTopup
   Session  → parkingSessionService.settleSessionPayment
   Both are race-safe & idempotent and shared with their manual verify endpoints.
───────────────────────────────────────────── */

/* ─────────────────────────────────────────────
   Reservation fee handler (PayOS payment)
───────────────────────────────────────────── */

const handleReservationFee = async (pendingPayment, amount, mongoSession) => {
  const reservation = await Reservation.findById(pendingPayment.reservation).session(mongoSession);
  if (!reservation) throw new AppError('Reservation not found', 404);

  if (reservation.status === 'confirmed') return; // already confirmed

  // Confirm reservation
  reservation.status = 'confirmed';
  await reservation.save({ session: mongoSession });

  // Mark slot reserved if assigned
  if (reservation.slot) {
    const ParkingSlotModel = require('../../models/building/ParkingSlot');
    await ParkingSlotModel.findByIdAndUpdate(
      reservation.slot,
      { status: 'reserved' },
      { session: mongoSession },
    );
  }

  // Credit building wallet
  if (pendingPayment.building) {
    await buildingWalletService.credit(
      pendingPayment.building, amount, 'reservation_fee', pendingPayment._id, mongoSession,
    );
  }

  await Payment.findByIdAndUpdate(
    pendingPayment._id,
    { status: 'success' },
    { session: mongoSession },
  );
};

/* ─────────────────────────────────────────────
   Main dispatcher
───────────────────────────────────────────── */

/**
 * Verify and dispatch a PayOS webhook event.
 *
 * @param {Object} body - Parsed JSON body from PayOS
 */
const handle = async (body) => {
  // Verify signature — throws if invalid
  let webhookData;
  try {
    webhookData = await payosService.verifyWebhook(body);
  } catch (err) {
    throw new AppError(`PayOS webhook verification failed: ${err.message}`, 400);
  }

  // Only process successful payments
  if (!webhookData || webhookData.code !== '00') return;

  const { orderCode, amount } = webhookData;

  // Look up our pending Payment record
  const pendingPayment = await Payment.findOne({
    payosOrderCode: orderCode,
    status: 'pending',
  });

  // Unknown order or already processed → ignore (idempotent)
  if (!pendingPayment) return;

  // Top-up & session each run their own race-safe transaction (shared with their
  // manual verify endpoints), so they're handled outside the reservation txn.
  if (pendingPayment.type === 'topup') {
    // Building wallet topup (manager) vs user wallet topup — differentiated by building field
    if (pendingPayment.building) {
      await buildingWalletTopupService.settleTopup(orderCode);
    } else {
      await walletService.settleTopup(orderCode);
    }
    return;
  }
  if (pendingPayment.type === 'session') {
    await parkingSessionService.settleSessionPayment(orderCode);
    return;
  }

  const mongoSession = await mongoose.startSession();
  try {
    await mongoSession.withTransaction(async () => {
      if (pendingPayment.type === 'reservation') {
        await handleReservationFee(pendingPayment, amount, mongoSession);
      }
    });
  } finally {
    mongoSession.endSession();
  }
};

module.exports = { handle };
