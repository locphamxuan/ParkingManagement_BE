const RefundPolicy = require('../models/policy/RefundPolicy');

// Default duy nhất toàn hệ thống khi tòa CHƯA có RefundPolicy — khớp DEFAULT_POLICY
// của manager/refundPolicy.service. (Trước đây mỗi luồng hủy dùng default khác nhau
// → user được hứa 80% nhưng thực nhận 0đ ở tòa chưa cấu hình.)
const DEFAULT_REFUND_PERCENT = 80;

const clampPercent = (value, fallback) => {
  const n = Number(value ?? fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, 0), 100);
};

/**
 * % hoàn tiền khi hủy gói dài hạn theo RefundPolicy (refund policy) của tòa.
 * Dùng chung cho MỌI luồng hoàn tiền (user tự hủy / manager hủy) để default/clamp
 * luôn nhất quán.
 */
const getRefundPercent = async (buildingId, session = null) => {
  const policy = await RefundPolicy.findOne({ building: buildingId })
    .select('refundPercent isActive')
    .session(session);
  if (policy && !policy.isActive) return 0;
  return clampPercent(policy?.refundPercent, DEFAULT_REFUND_PERCENT);
};

module.exports = { getRefundPercent, clampPercent, DEFAULT_REFUND_PERCENT };
