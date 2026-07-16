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

const payosService = require('./payos.service');
const { Payment } = require('../../models');
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

  const { orderCode } = webhookData;

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

  // Các loại payment khác không xử lý qua webhook → bỏ qua (idempotent).
};

module.exports = { handle };
