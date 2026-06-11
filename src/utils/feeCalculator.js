/**
 * feeCalculator.js — phí gửi xe lúc CHECKOUT.
 * Thin wrapper trên feeEngine.computeFee (lõi split-minute dùng chung với ước
 * tính reservation). Trả về 0 khi building chưa có PricePolicy — nơi gọi tự áp
 * giá mặc định theo loại xe (constants/pricing).
 */
const { computeFee, calculateTotalPeakMinutes } = require('./feeEngine');

/**
 * @param {string|ObjectId} buildingId
 * @param {string|ObjectId} vehicleTypeId
 * @param {Date|string} entryTime
 * @param {Date|string} exitTime
 * @returns {Promise<number>} phí (VND, làm tròn lên); 0 nếu chưa có policy.
 */
async function calculateParkingFee(buildingId, vehicleTypeId, entryTime, exitTime) {
  const { fee } = await computeFee({
    buildingId,
    vehicleTypeId,
    start: entryTime,
    end: exitTime,
  });
  return fee;
}

module.exports = { calculateParkingFee, calculateTotalPeakMinutes };
