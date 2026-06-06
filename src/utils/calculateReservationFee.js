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

const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/**
 * Calculate the estimated total fee for a reservation.
 *
 * Pricing is resolved per parked hour so a single booking can span both regular
 * and peak windows: each hour is billed at the rate of the policy that applies
 * at the start of that hour. Precedence per hour: holiday > peak > regular.
 *
 * @returns {Promise<{ estimatedFee, hourlyRate, hours, regularHours, peakHours, peakRate }>}
 */
// Khi policy không cấu hình minRate, áp sàn tối thiểu tương đương số phút này.
const MIN_BILLABLE_MINUTES = 30;

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
  const holidayPolicies = policies.filter((p) => p.type === 'holiday');

  // Regular (base) rate + dailyCap, falling back to building pricing then a floor.
  let regularRate = regularPolicy?.hourlyRate ?? null;
  let dailyCap = regularPolicy?.dailyCap ?? null;
  if (regularRate == null) {
    const building = await Building.findById(buildingId).select('pricing').lean();
    regularRate = building?.pricing?.hourlyRate ?? 5000;
    if (dailyCap == null) dailyCap = building?.pricing?.dailyCap ?? null;
  }

  // Resolve the rate for the hour-block that begins at Date `d`.
  const rateForHour = (d) => {
    const minute = d.getHours() * 60 + d.getMinutes();

    // 1) Holiday policies take precedence on matching dates.
    for (const h of holidayPolicies) {
      const matchesDate = (h.holidayDates || []).some((hd) => sameDay(new Date(hd), d));
      if (matchesDate && inWindow(minute, toMinutes(h.timeWindow?.from), toMinutes(h.timeWindow?.to))) {
        return h.hourlyRate;
      }
    }

    // 2) Peak policies — if several match, charge the highest peak rate.
    let peak = null;
    for (const p of peakPolicies) {
      if (inWindow(minute, toMinutes(p.timeWindow?.from), toMinutes(p.timeWindow?.to))) {
        if (peak == null || p.hourlyRate > peak) peak = p.hourlyRate;
      }
    }
    if (peak != null) return peak;

    // 3) Default regular rate.
    return regularRate;
  };

  // Pro-rate theo phút: đi qua từng block 1 giờ (giữ đúng peak/holiday theo giờ
  // bắt đầu block), block cuối chỉ tính phần phút còn lại.
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

  // Phí tối thiểu: ưu tiên minRate của policy, nếu không có thì lấy ~30 phút giá thường.
  const minCharge =
    regularPolicy?.minRate && regularPolicy.minRate > 0
      ? regularPolicy.minRate
      : Math.ceil(regularRate * (MIN_BILLABLE_MINUTES / 60));
  let minimumApplied = false;
  if (totalMinutes > 0 && estimatedFee < minCharge) {
    estimatedFee = minCharge;
    minimumApplied = true;
  }

  // Apply a daily cap (regular policy) across the whole stay if set.
  if (dailyCap != null && dailyCap > 0) {
    const days = Math.max(1, Math.ceil(totalMinutes / 1440));
    estimatedFee = Math.min(estimatedFee, dailyCap * days);
  }

  return {
    estimatedFee: Math.ceil(estimatedFee),
    hourlyRate: regularRate,
    durationMinutes: Math.round(totalMinutes),
    hours: Math.ceil(totalMinutes / 60), // giữ để tương thích phần gọi cũ
    regularHours: regularMinutes / 60,
    peakHours: peakMinutes / 60,
    peakRate: peakRateApplied,
    minimumApplied,
  };
};

module.exports = calculateReservationFee;
