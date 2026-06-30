/**
 * feeEngine.js — LÕI tính phí dùng chung cho cả checkout (phí thực thu) lẫn ước
 * tính reservation, để hai bên LUÔN nhất quán (cùng thuật toán split-minute).
 *
 * Thuật toán: tách thời gian thành peak / regular theo từng phút.
 *  - Lọc policy còn hiệu lực trong [start, end] (effectiveFrom/effectiveTo).
 *  - Cộng phí TẤT CẢ khung peak (mỗi khung theo rate riêng), phần còn lại = regular.
 */
const PricePolicy = require('../models/policy/PricePolicy');
const Building = require('../models/building/Building');
const { FALLBACK_HOURLY_RATE } = require('../constants/pricing');

/** Parse 'HH:MM' → minutes from midnight */
function parseHHMM(str) {
  const [h, m] = (str || '00:00').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Tổng số PHÚT cao điểm trong [resStartMs, resEndMs] với khung peak 'HH:MM'
 * from/to (lặp mỗi ngày). Hỗ trợ khung qua nửa đêm (vd 22:00–06:00).
 */
function calculateTotalPeakMinutes(resStartMs, resEndMs, peakFrom, peakTo) {
  const peakStartMin = parseHHMM(peakFrom);
  const peakEndMin = parseHHMM(peakTo);
  const isOvernight = peakStartMin > peakEndMin;

  let totalPeakMs = 0;
  let dayStart = new Date(resStartMs);
  dayStart.setHours(0, 0, 0, 0);

  while (dayStart.getTime() < resEndMs) {
    const dayMs = dayStart.getTime();
    const nextDayMs = dayMs + 86_400_000;
    const segStart = Math.max(resStartMs, dayMs);
    const segEnd = Math.min(resEndMs, nextDayMs);

    if (segStart < segEnd) {
      if (!isOvernight) {
        const winStart = dayMs + peakStartMin * 60_000;
        const winEnd = dayMs + peakEndMin * 60_000;
        const ov = Math.min(segEnd, winEnd) - Math.max(segStart, winStart);
        if (ov > 0) totalPeakMs += ov;
      } else {
        const ovA = Math.min(segEnd, nextDayMs) - Math.max(segStart, dayMs + peakStartMin * 60_000);
        if (ovA > 0) totalPeakMs += ovA;
        const ovB = Math.min(segEnd, dayMs + peakEndMin * 60_000) - Math.max(segStart, dayMs);
        if (ovB > 0) totalPeakMs += ovB;
      }
    }
    dayStart = new Date(nextDayMs);
  }

  return totalPeakMs / 60_000;
}

/**
 * Tính phí cho khoảng [start, end] theo PricePolicy của building + vehicleType.
 * @returns {Promise<{fee:number,totalMinutes:number,regularMinutes:number,peakMinutes:number,regularRate:number|null,peakRate:number|null,hasPolicy:boolean}>}
 *          fee = 0 và hasPolicy = false khi chưa có policy (caller tự quyết fallback).
 */
async function computeFee({ buildingId, vehicleTypeId, start, end, preloadedPolicies }) {
  const empty = {
    fee: 0, totalMinutes: 0, regularMinutes: 0, peakMinutes: 0,
    regularRate: null, peakRate: null, hasPolicy: false,
  };
  if (!start || !end) return empty;
  const entry = new Date(start);
  const exit = new Date(end);
  if (Number.isNaN(entry.getTime()) || Number.isNaN(exit.getTime()) || exit <= entry) return empty;

  const totalMinutes = (exit.getTime() - entry.getTime()) / 60_000;

  // Policy còn hiệu lực trong [entry, exit].
  const policies = Array.isArray(preloadedPolicies)
    ? preloadedPolicies
        .filter(
          (p) =>
            p.isActive &&
            new Date(p.effectiveFrom) <= exit &&
            (p.effectiveTo == null || new Date(p.effectiveTo) >= entry),
        )
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    : await PricePolicy.find({
        building: buildingId,
        vehicleType: vehicleTypeId,
        isActive: true,
        effectiveFrom: { $lte: exit },
        $or: [{ effectiveTo: null }, { effectiveTo: { $gte: entry } }],
      }).sort({ createdAt: -1 });

  if (policies.length === 0) return { ...empty, totalMinutes };

  const regularPolicy = policies.find((p) => p.type === 'regular') || null;
  const peakPolicies = policies.filter((p) => p.type === 'peak');

  // Cộng phí từng khung peak theo rate riêng (giả định khung không chồng nhau).
  let peakMinutes = 0;
  let peakFee = 0;
  let peakRate = null;
  for (const pp of peakPolicies) {
    const from = pp.timeWindow?.from || '00:00';
    const to = pp.timeWindow?.to || '23:59';
    const peakMin = calculateTotalPeakMinutes(entry.getTime(), exit.getTime(), from, to);
    if (peakMin > 0) {
      peakMinutes += peakMin;
      peakFee += (pp.hourlyRate / 60) * peakMin;
      if (peakRate == null || pp.hourlyRate > peakRate) peakRate = pp.hourlyRate;
    }
  }

  const regularMinutes = Math.max(0, totalMinutes - peakMinutes);
  // Không có regular policy → dùng rate peak đầu tiên làm nền (giữ hành vi cũ).
  const regularRate = regularPolicy ? regularPolicy.hourlyRate : (peakPolicies[0]?.hourlyRate ?? 0);

  let fee = peakFee;
  if (regularMinutes > 0) fee += (regularRate / 60) * regularMinutes;

  return {
    fee: Math.ceil(fee),
    totalMinutes,
    regularMinutes,
    peakMinutes,
    regularRate,
    peakRate,
    hasPolicy: true,
  };
}

/**
 * Tính phí thực thu lúc checkout.
 * Thin wrapper trên computeFee — trả về 0 khi chưa có PricePolicy.
 */
async function calculateParkingFee(buildingId, vehicleTypeId, entryTime, exitTime, preloadedPolicies) {
  const { fee } = await computeFee({
    buildingId,
    vehicleTypeId,
    start: entryTime,
    end: exitTime,
    preloadedPolicies,
  });
  return fee;
}

/**
 * Ước tính phí cho một lượt đặt chỗ (reservation).
 * Fallback về Building.pricing khi building chưa có PricePolicy.
 */
async function calculateReservationFee(buildingId, vehicleTypeId, startTime, endTime) {
  const start = new Date(startTime);
  const end = new Date(endTime);

  const r = await computeFee({ buildingId, vehicleTypeId, start, end });
  const totalMinutes = r.totalMinutes || Math.max(0, (end - start) / 60_000);

  let estimatedFee = r.fee;
  let regularRate = r.regularRate;
  let regularMinutes = r.regularMinutes;
  let peakMinutes = r.peakMinutes;
  let peakRate = r.peakRate;

  if (!r.hasPolicy) {
    const building = await Building.findById(buildingId).select('pricing').lean();
    regularRate = building?.pricing?.hourlyRate ?? FALLBACK_HOURLY_RATE;
    regularMinutes = totalMinutes;
    peakMinutes = 0;
    peakRate = null;
    estimatedFee = Math.ceil((regularRate / 60) * totalMinutes);
  }

  return {
    estimatedFee,
    hourlyRate: regularRate,
    durationMinutes: Math.round(totalMinutes),
    hours: Math.ceil(totalMinutes / 60),
    regularHours: regularMinutes / 60,
    peakHours: peakMinutes / 60,
    peakRate,
    minimumApplied: false,
  };
}

module.exports = { computeFee, calculateTotalPeakMinutes, calculateParkingFee, calculateReservationFee };
