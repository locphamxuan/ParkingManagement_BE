/**
 * Shared financial classification.
 *
 * Revenue is recognized only when a Payment is successful. Top-ups are funding
 * movements, not earned revenue. Refunds are deducted from gross revenue.
 */
// Loại doanh thu của các sản phẩm ĐANG bán: phí gửi xe, gói dài hạn, phí phạt.
const CURRENT_REVENUE_PAYMENT_TYPES = ['session', 'subscription', 'penalty'];
const REVENUE_PAYMENT_TYPES = [...CURRENT_REVENUE_PAYMENT_TYPES];
const REFUND_PAYMENT_TYPES = ['refund'];
const FUNDING_PAYMENT_TYPES = ['topup'];
const ONLINE_PAYMENT_METHODS = ['qr', 'payos', 'card'];

module.exports = {
  CURRENT_REVENUE_PAYMENT_TYPES,
  REVENUE_PAYMENT_TYPES,
  REFUND_PAYMENT_TYPES,
  FUNDING_PAYMENT_TYPES,
  ONLINE_PAYMENT_METHODS,
};
