/**
 * Shared financial classification.
 *
 * Revenue is recognized only when a Payment is successful. Top-ups are funding
 * movements, not earned revenue. Refunds are deducted from gross revenue.
 */
const REVENUE_PAYMENT_TYPES = ['session', 'reservation', 'subscription', 'penalty'];
const REFUND_PAYMENT_TYPES = ['refund'];
const FUNDING_PAYMENT_TYPES = ['topup'];
const ONLINE_PAYMENT_METHODS = ['qr', 'payos', 'card'];

module.exports = {
  REVENUE_PAYMENT_TYPES,
  REFUND_PAYMENT_TYPES,
  FUNDING_PAYMENT_TYPES,
  ONLINE_PAYMENT_METHODS,
};
