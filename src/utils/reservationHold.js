const ReservationPolicy = require('../models/policy/ReservationPolicy');

// Mặc định khi tòa nhà chưa có chính sách reservation.
const DEFAULT_MAX_HOLD_MINUTES = 30;

/**
 * Trả về thời gian giữ chỗ (ms) sau giờ bắt đầu theo chính sách của tòa nhà
 * (ReservationPolicy.maxHoldMinutes do manager cấu hình). Quá khoảng này mà
 * chưa check-in thì lượt đặt bị coi là hết hạn.
 */
const getMaxHoldMs = async (buildingId, session = null) => {
  const policy = await ReservationPolicy.findOne({ building: buildingId })
    .select('maxHoldMinutes')
    .session(session);
  const minutes = policy?.maxHoldMinutes ?? DEFAULT_MAX_HOLD_MINUTES;
  return Math.max(Number(minutes) || 0, 0) * 60 * 1000;
};

/**
 * % phụ phí phạt áp lên phần đỗ quá giờ đặt (ReservationPolicy.overstayPenaltyPercent,
 * fallback 0 = không phạt).
 */
const getOverstayPenaltyPercent = async (buildingId, session = null) => {
  const policy = await ReservationPolicy.findOne({ building: buildingId })
    .select('overstayPenaltyPercent')
    .session(session);
  return Math.max(Number(policy?.overstayPenaltyPercent ?? 0) || 0, 0);
};

// Default duy nhất toàn hệ thống khi tòa CHƯA có ReservationPolicy — khớp DEFAULTS
// của manager/reservationPolicy.service và endpoint public /users/reservations/policy.
// (Trước đây hủy reservation/expire dùng 0 còn hủy gói dùng 80 → user được hứa 80%
// nhưng thực nhận 0đ ở tòa chưa cấu hình.)
const DEFAULT_REFUND_PERCENT = 80;

const clampPercent = (value, fallback) => {
  const n = Number(value ?? fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, 0), 100);
};

/**
 * % hoàn tiền khi hủy (reservation + gói dài hạn) theo ReservationPolicy của tòa.
 * Dùng chung cho MỌI luồng hoàn tiền để default/clamp luôn nhất quán.
 */
const getRefundPercent = async (buildingId, session = null) => {
  const policy = await ReservationPolicy.findOne({ building: buildingId })
    .select('refundPercent')
    .session(session);
  return clampPercent(policy?.refundPercent, DEFAULT_REFUND_PERCENT);
};

module.exports = {
  getMaxHoldMs,
  getOverstayPenaltyPercent,
  getRefundPercent,
  clampPercent,
  DEFAULT_MAX_HOLD_MINUTES,
  DEFAULT_REFUND_PERCENT,
};
