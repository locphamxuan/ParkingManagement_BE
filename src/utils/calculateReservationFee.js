const PricePolicy = require('../models/policy/PricePolicy');
const Building = require('../models/building/Building');

// "HH:MM" → minutes since midnight
const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm ?? '').split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
};

// Is `minute` (0..1439) inside [from, to)? Supports windows crossing midnight.
const inWindow = (minute, from, to) => {
  if (from === to) return false;
  if (from < to) return minute >= from && minute < to;
  // window wraps past midnight, e.g. 22:00 → 02:00
  return minute >= from || minute < to;
};

/**
 * Calculate the estimated total fee for a reservation.
 *
 * Mỗi giờ tính theo policy áp dụng tại thời điểm bắt đầu giờ đó: peak > regular.
 *
 * @returns {Promise<{ estimatedFee, hourlyRate, hours, regularHours, peakHours, peakRate }>}
 */
const calculateReservationFee = async (buildingId, vehicleTypeId, startTime, endTime) => {
  const start = new Date(startTime);
  const end = new Date(endTime);
  // Tổng thời gian thực (phút) — không làm tròn lên theo giờ nữa.
  const totalMinutes = Math.max(0, (end - start) / 60_000);

  // Load every active policy for this building + vehicle type.
  const policies = await PricePolicy.find({
    building: buildingId,
    vehicleType: vehicleTypeId,
    isActive: true,
  })
    .sort('-effectiveFrom')
    .lean();

  const regularPolicy = policies.find((p) => p.type === 'regular');
  const peakPolicies = policies.filter((p) => p.type === 'peak');

  // Regular (base) rate, falling back to building pricing.
  let regularRate = regularPolicy?.hourlyRate ?? null;
  if (regularRate == null) {
    const building = await Building.findById(buildingId).select('pricing').lean();
    regularRate = building?.pricing?.hourlyRate ?? 5000;
  }

  // Resolve the rate for the hour-block that begins at Date `d` (peak > regular).
  const rateForHour = (d) => {
    const minute = d.getHours() * 60 + d.getMinutes();
    let peak = null;
    for (const p of peakPolicies) {
      if (inWindow(minute, toMinutes(p.timeWindow?.from), toMinutes(p.timeWindow?.to))) {
        if (peak == null || p.hourlyRate > peak) peak = p.hourlyRate;
      }
    }
    if (peak != null) return peak;
    return regularRate;
  };

  // Pro-rate theo phút: đi qua từng block 1 giờ (giữ đúng peak theo giờ bắt đầu
  // block), block cuối chỉ tính phần phút còn lại.
  let estimatedFee = 0;
  let regularMinutes = 0;
  let peakMinutes = 0;
  let peakRateApplied = null;
  let remaining = totalMinutes;
  let i = 0;
  while (remaining > 0) {
    const blockStart = new Date(start.getTime() + i * 3_600_000);
    const rate = rateForHour(blockStart);
    const mins = Math.min(60, remaining);
    estimatedFee += rate * (mins / 60);
    if (rate > regularRate) {
      peakMinutes += mins;
      peakRateApplied = rate;
    } else {
      regularMinutes += mins;
    }
    remaining -= mins;
    i++;
  }

  return {
    estimatedFee: Math.ceil(estimatedFee),
    hourlyRate: regularRate,
    durationMinutes: Math.round(totalMinutes),
    hours: Math.ceil(totalMinutes / 60), // giữ để tương thích phần gọi cũ
    regularHours: regularMinutes / 60,
    peakHours: peakMinutes / 60,
    peakRate: peakRateApplied,
    minimumApplied: false,
  };
};

module.exports = calculateReservationFee;
