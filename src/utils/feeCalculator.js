/**
 * feeCalculator.js
 * Tính phí gửi xe với split-time pricing: tách khoảng thời gian thành peak / regular.
 * Ví dụ: 06:00–10:00 với peak 07:00–09:00 → 60 phút thường + 120 phút cao điểm + 60 phút thường.
 * Priority override: holiday > peak > regular
 * Floor-level pricePolicy override toàn bộ building-level policy (1 mức giá duy nhất).
 */

const PricePolicy = require('../models/policy/PricePolicy');
const Floor = require('../models/building/Floor');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Parse 'HH:MM' → minutes from midnight */
function parseHHMM(str) {
  const [h, m] = (str || '00:00').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Kiểm tra 1 ngày có nằm trong holidayDates không (so sánh YYYY-MM-DD local date)
 */
function isHoliday(date, holidayDates = []) {
  if (!holidayDates || holidayDates.length === 0) return false;
  const d = new Date(date);
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return holidayDates.some((hd) => {
    const hDate = new Date(hd);
    const hKey = `${hDate.getFullYear()}-${String(hDate.getMonth() + 1).padStart(2, '0')}-${String(hDate.getDate()).padStart(2, '0')}`;
    return key === hKey;
  });
}

/**
 * Tính số PHÚT cao điểm trong khoảng [resStartMs, resEndMs]
 * với peak window định nghĩa bởi 'HH:MM' from/to (lặp mỗi ngày).
 * Hỗ trợ overnight window (vd 22:00–06:00).
 *
 * @param {number} resStartMs - start timestamp (ms)
 * @param {number} resEndMs   - end timestamp (ms)
 * @param {string} peakFrom   - 'HH:MM'
 * @param {string} peakTo     - 'HH:MM'
 * @returns {number} peak minutes
 */
function calculateTotalPeakMinutes(resStartMs, resEndMs, peakFrom, peakTo) {
  const peakStartMin = parseHHMM(peakFrom); // minutes from midnight
  const peakEndMin = parseHHMM(peakTo);
  const isOvernight = peakStartMin > peakEndMin; // e.g. 22:00 → 06:00

  let totalPeakMs = 0;

  // Walk day by day
  let dayStart = new Date(resStartMs);
  dayStart.setHours(0, 0, 0, 0);

  while (dayStart.getTime() < resEndMs) {
    const dayMs = dayStart.getTime();
    const nextDayMs = dayMs + 86_400_000; // +24h

    // Reservation segment that falls on THIS day
    const segStart = Math.max(resStartMs, dayMs);
    const segEnd = Math.min(resEndMs, nextDayMs);

    if (segStart < segEnd) {
      if (!isOvernight) {
        // Normal daytime window: e.g. 07:00–09:00
        const winStart = dayMs + peakStartMin * 60_000;
        const winEnd = dayMs + peakEndMin * 60_000;
        const ov = Math.min(segEnd, winEnd) - Math.max(segStart, winStart);
        if (ov > 0) totalPeakMs += ov;
      } else {
        // Overnight window (e.g. 22:00–06:00) → two segments per day:
        //   Part A: peakStart → midnight (00:00 of next day)
        const winAStart = dayMs + peakStartMin * 60_000;
        const winAEnd = nextDayMs;
        const ovA = Math.min(segEnd, winAEnd) - Math.max(segStart, winAStart);
        if (ovA > 0) totalPeakMs += ovA;

        //   Part B: 00:00 of this day → peakEnd
        const winBStart = dayMs;
        const winBEnd = dayMs + peakEndMin * 60_000;
        const ovB = Math.min(segEnd, winBEnd) - Math.max(segStart, winBStart);
        if (ovB > 0) totalPeakMs += ovB;
      }
    }

    // Move to next day
    dayStart = new Date(nextDayMs);
  }

  return totalPeakMs / 60_000; // → minutes
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Tính phí gửi xe.
 *
 * Logic:
 *  1. Nếu floor có pricePolicy override → dùng 1 mức giá đơn cho toàn bộ thời gian.
 *  2. Nếu ngày bắt đầu là ngày lễ → dùng holiday rate cho toàn bộ thời gian.
 *  3. Tách thời gian:
 *       peakMinutes   = tổng thời gian nằm trong khung giờ cao điểm
 *       regularMinutes = totalMinutes − peakMinutes
 *     → fee = peakMinutes/60 × peakRate + regularMinutes/60 × regularRate
 *  4. Áp minRate (tối thiểu) và dailyCap (tối đa) từ regular policy.
 *
 * @param {string|ObjectId} buildingId
 * @param {string|ObjectId} vehicleTypeId
 * @param {string|ObjectId|null} floorId
 * @param {Date|string} entryTime
 * @param {Date|string} exitTime
 * @returns {Promise<number>} phí (VND, làm tròn lên)
 */
async function calculateParkingFee(buildingId, vehicleTypeId, floorId, entryTime, exitTime) {
  if (!entryTime || !exitTime) return 0;

  const entry = new Date(entryTime);
  const exit = new Date(exitTime);
  if (isNaN(entry.getTime()) || isNaN(exit.getTime())) return 0;
  if (exit <= entry) return 0;

  const totalMinutes = (exit.getTime() - entry.getTime()) / 60_000;

  // ── 1. Floor-level policy override ─────────────────────────────────────────
  if (floorId) {
    const floor = await Floor.findById(floorId).populate('pricePolicy');
    if (floor?.pricePolicy?.isActive) {
      const fp = floor.pricePolicy;
      let fee = (fp.hourlyRate / 60) * totalMinutes;
      if (fp.minRate && fee < fp.minRate) fee = fp.minRate;
      if (fp.dailyCap && fee > fp.dailyCap) fee = fp.dailyCap;
      return Math.ceil(fee);
    }
  }

  // ── 2. Load tất cả active policies cho building + vehicleType ───────────────
  const policies = await PricePolicy.find({
    building: buildingId,
    vehicleType: vehicleTypeId,
    isActive: true,
    $or: [{ effectiveTo: null }, { effectiveTo: { $gte: entry } }],
  }).sort({ createdAt: -1 });

  if (policies.length === 0) return 0;

  // Phân loại
  const regularPolicy = policies.find((p) => p.type === 'regular') || null;
  const peakPolicies = policies.filter((p) => p.type === 'peak');
  const holidayPolicies = policies.filter((p) => p.type === 'holiday');

  // ── 3. Holiday — áp dụng nếu ngày bắt đầu là ngày lễ ──────────────────────
  const holidayPolicy = holidayPolicies.find((p) => isHoliday(entry, p.holidayDates));
  if (holidayPolicy) {
    let fee = (holidayPolicy.hourlyRate / 60) * totalMinutes;
    if (holidayPolicy.minRate && fee < holidayPolicy.minRate) fee = holidayPolicy.minRate;
    if (holidayPolicy.dailyCap && fee > holidayPolicy.dailyCap) fee = holidayPolicy.dailyCap;
    return Math.ceil(fee);
  }

  // ── 4. Split-time: tách khoảng thời gian thành peak / regular ──────────────
  let totalPeakMinutes = 0;
  let effectivePeakPolicy = null;

  for (const pp of peakPolicies) {
    const from = pp.timeWindow?.from || '00:00';
    const to = pp.timeWindow?.to || '23:59';
    const peakMin = calculateTotalPeakMinutes(entry.getTime(), exit.getTime(), from, to);
    if (peakMin > 0) {
      // Dùng peak policy đầu tiên match (đã sort createdAt desc)
      totalPeakMinutes += peakMin;
      if (!effectivePeakPolicy) effectivePeakPolicy = pp;
      break; // chỉ dùng 1 peak policy (priority đầu tiên)
    }
  }

  const regularMinutes = Math.max(0, totalMinutes - totalPeakMinutes);

  // ── 5. Tính phí ─────────────────────────────────────────────────────────────
  let fee = 0;

  if (effectivePeakPolicy && totalPeakMinutes > 0) {
    fee += (effectivePeakPolicy.hourlyRate / 60) * totalPeakMinutes;
  }

  if (regularMinutes > 0) {
    const ratePerMin = regularPolicy
      ? regularPolicy.hourlyRate / 60
      : effectivePeakPolicy
        ? effectivePeakPolicy.hourlyRate / 60 // fallback: dùng peak rate nếu không có regular
        : 0;
    fee += ratePerMin * regularMinutes;
  }

  // ── 6. Áp minRate và dailyCap từ regular policy (nếu có) ───────────────────
  const capPolicy = regularPolicy || effectivePeakPolicy;
  if (capPolicy?.minRate && fee < capPolicy.minRate) fee = capPolicy.minRate;
  if (capPolicy?.dailyCap && fee > capPolicy.dailyCap) fee = capPolicy.dailyCap;

  return Math.ceil(fee);
}

module.exports = { calculateParkingFee, calculateTotalPeakMinutes, isHoliday };
