/**
 * calculateReservationFee.js — ước tính phí cho một lượt đặt chỗ.
 * Dùng chung lõi feeEngine.computeFee (split-minute) với phí thực lúc checkout →
 * ước tính và phí thực LUÔN nhất quán. Khi building chưa có PricePolicy thì
 * fallback về Building.pricing hoặc giá mặc định chung.
 *
 * Giữ nguyên shape trả về cho nơi gọi: { estimatedFee, hourlyRate, hours,
 * regularHours, peakHours, peakRate, durationMinutes, minimumApplied }.
 */
const Building = require('../models/building/Building');
const { computeFee } = require('./feeEngine');
const { FALLBACK_HOURLY_RATE } = require('../constants/pricing');

const calculateReservationFee = async (buildingId, vehicleTypeId, startTime, endTime) => {
  const start = new Date(startTime);
  const end = new Date(endTime);

  const r = await computeFee({ buildingId, vehicleTypeId, start, end });
  const totalMinutes = r.totalMinutes || Math.max(0, (end - start) / 60_000);

  let estimatedFee = r.fee;
  let regularRate = r.regularRate;
  let regularMinutes = r.regularMinutes;
  let peakMinutes = r.peakMinutes;
  let peakRate = r.peakRate;

  // Building chưa có PricePolicy → fallback giá nền (Building.pricing hoặc mặc định).
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
    hours: Math.ceil(totalMinutes / 60), // giữ để tương thích phần gọi cũ
    regularHours: regularMinutes / 60,
    peakHours: peakMinutes / 60,
    peakRate,
    minimumApplied: false,
  };
};

module.exports = calculateReservationFee;
