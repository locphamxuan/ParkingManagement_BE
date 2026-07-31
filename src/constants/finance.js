/**
 * Shared financial classification.
 *
 * Revenue is recognized only when a Payment is successful. Top-ups are funding
 * movements, not earned revenue. Refunds are deducted from gross revenue.
 */
// Loại doanh thu của các sản phẩm ĐANG bán: phí gửi xe, gói dài hạn, phí phạt.
const CURRENT_REVENUE_PAYMENT_TYPES = ['session', 'subscription', 'penalty'];
// 'reservation' là loại LỊCH SỬ (tính năng đặt chỗ theo giờ đã bỏ, không còn bản
// ghi mới nào được tạo). Giữ trong tập doanh thu để tổng thu của các kỳ CŨ không
// tự nhiên hụt đi — KHÔNG phải sản phẩm hiện hành, không hiển thị như một nguồn
// doanh thu đang hoạt động (xem `bySource.other` ở admin/revenue.service.js).
const LEGACY_REVENUE_PAYMENT_TYPES = ['reservation'];
const REVENUE_PAYMENT_TYPES = [...CURRENT_REVENUE_PAYMENT_TYPES, ...LEGACY_REVENUE_PAYMENT_TYPES];
const REFUND_PAYMENT_TYPES = ['refund'];
const FUNDING_PAYMENT_TYPES = ['topup'];
const ONLINE_PAYMENT_METHODS = ['qr', 'payos', 'card'];

module.exports = {
  CURRENT_REVENUE_PAYMENT_TYPES,
  LEGACY_REVENUE_PAYMENT_TYPES,
  REVENUE_PAYMENT_TYPES,
  REFUND_PAYMENT_TYPES,
  FUNDING_PAYMENT_TYPES,
  ONLINE_PAYMENT_METHODS,
};
