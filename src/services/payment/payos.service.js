/**
 * payos.service.js
 * Thin wrapper around the @payos/node SDK (v2).
 * All other services call these helpers — they never import PayOS directly.
 *
 * Docs: https://payos.vn/docs/api
 * Currency: VND (integer, no conversion needed)
 */

const { PayOS } = require('@payos/node');
const env = require('../../config/env');

const payos = new PayOS({
  clientId: env.payosClientId,
  apiKey: env.payosApiKey,
  checksumKey: env.payosChecksumKey,
});

/* ─────────────────────────────────────────────
   Order code generation
   PayOS requires a unique numeric orderCode per transaction.
   We combine unix-seconds (last 8 digits) + 2 random digits → 10-digit number.
───────────────────────────────────────────── */

const generateOrderCode = () => {
  const ts = String(Math.floor(Date.now() / 1000)).slice(-8); // 8 digits
  const rand = String(Math.floor(Math.random() * 100)).padStart(2, '0'); // 2 digits
  return Number(`${ts}${rand}`);
};

/* ─────────────────────────────────────────────
   Create payment link
───────────────────────────────────────────── */

/**
 * Tạo PayOS payment link (QR + checkout URL).
 *
 * @param {Object} params
 * @param {number} params.orderCode     - Unique numeric order code (use generateOrderCode())
 * @param {number} params.amount        - Amount in VND (integer)
 * @param {string} params.description   - Short description (max 25 ASCII chars for QR compat)
 * @param {string} [params.buyerName]   - Buyer's name (optional)
 * @param {string} [params.buyerEmail]  - Buyer's email (optional)
 * @param {string} [params.returnUrl]   - Success redirect URL
 * @param {string} [params.cancelUrl]   - Cancel redirect URL
 * @returns {Promise<{checkoutUrl: string, qrCode: string, paymentLinkId: string, orderCode: number}>}
 */
const createPaymentLink = async ({
  orderCode,
  amount,
  description,
  buyerName,
  buyerEmail,
  returnUrl,
  cancelUrl,
}) => {
  const response = await payos.paymentRequests.create({
    orderCode,
    amount,
    description: (description || 'Thanh toan PBMS').slice(0, 25),
    returnUrl: returnUrl || `${env.clientUrl}/payment/success`,
    cancelUrl: cancelUrl || `${env.clientUrl}/payment/cancel`,
    buyerName: buyerName || undefined,
    buyerEmail: buyerEmail || undefined,
    expiredAt: Math.floor(Date.now() / 1000) + 3600, // expire in 1 hour
  });

  return {
    checkoutUrl: response.checkoutUrl,
    qrCode: response.qrCode,
    paymentLinkId: response.paymentLinkId,
    orderCode: response.orderCode,
  };
};

/* ─────────────────────────────────────────────
   Webhook verification
───────────────────────────────────────────── */

/**
 * Verify a PayOS webhook payload and return the inner data object.
 * Throws if the signature is invalid.
 *
 * @param {Object} webhookBody - Parsed JSON body from PayOS webhook
 * @returns {Promise<import('@payos/node').WebhookData>}
 */
const verifyWebhook = async (webhookBody) => {
  return payos.webhooks.verify(webhookBody);
};

/* ─────────────────────────────────────────────
   Payment link management
───────────────────────────────────────────── */

/**
 * Get payment link info by orderCode.
 * @param {number} orderCode
 */
const getPaymentLink = async (orderCode) => {
  return payos.paymentRequests.get(orderCode);
};

/**
 * Cancel a payment link by orderCode.
 * @param {number} orderCode
 * @param {string} [reason]
 */
const cancelPaymentLink = async (orderCode, reason) => {
  return payos.paymentRequests.cancel(orderCode, reason);
};

module.exports = {
  generateOrderCode,
  createPaymentLink,
  verifyWebhook,
  getPaymentLink,
  cancelPaymentLink,
};
