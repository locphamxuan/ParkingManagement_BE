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
const calculateReservationFee = async (buildingId, vehicleTypeId, startTime, endTime) => {
  const start = new Date(startTime);
  const end = new Date(endTime);
  const hours = Math.max(1, Math.ceil((end - start) / 3_600_000));

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

  // Walk each billed hour from the start, summing its applicable rate.
  let estimatedFee = 0;
  let regularHours = 0;
  let peakHours = 0;
  let peakRateApplied = null;
  for (let i = 0; i < hours; i++) {
    const blockStart = new Date(start.getTime() + i * 3_600_000);
    const rate = rateForHour(blockStart);
    estimatedFee += rate;
    if (rate > regularRate) {
      peakHours += 1;
      peakRateApplied = rate;
    } else {
      regularHours += 1;
    }
  }

  // Apply a daily cap (regular policy) across the whole stay if set.
  if (dailyCap != null && dailyCap > 0) {
    const days = Math.ceil(hours / 24);
    estimatedFee = Math.min(estimatedFee, dailyCap * days);
  }

  return {
    estimatedFee: Math.ceil(estimatedFee),
    hourlyRate: regularRate,
    hours,
    regularHours,
    peakHours,
    peakRate: peakRateApplied,
  };
};

module.exports = calculateReservationFee;
