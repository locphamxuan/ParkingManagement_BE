const ReservationPolicy = require('../models/policy/ReservationPolicy');

// Default duy nhất toàn hệ thống khi tòa CHƯA có ReservationPolicy — khớp DEFAULT_POLICY
// của manager/reservationPolicy.service. (Trước đây mỗi luồng hủy dùng default khác nhau
// → user được hứa 80% nhưng thực nhận 0đ ở tòa chưa cấu hình.)
const DEFAULT_REFUND_PERCENT = 80;

const clampPercent = (value, fallback) => {
  const n = Number(value ?? fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, 0), 100);
};

/**
 * % hoàn tiền khi hủy gói dài hạn theo ReservationPolicy (refund policy) của tòa.
 * Dùng chung cho MỌI luồng hoàn tiền (user tự hủy / manager hủy) để default/clamp
 * luôn nhất quán.
 */
const getRefundPercent = async (buildingId, session = null) => {
  const policy = await ReservationPolicy.findOne({ building: buildingId })
    .select('refundPercent')
    .session(session);
  return clampPercent(policy?.refundPercent, DEFAULT_REFUND_PERCENT);
};

module.exports = { getRefundPercent, clampPercent, DEFAULT_REFUND_PERCENT };
