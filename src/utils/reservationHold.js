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

module.exports = { getMaxHoldMs, getOverstayPenaltyPercent, DEFAULT_MAX_HOLD_MINUTES };
