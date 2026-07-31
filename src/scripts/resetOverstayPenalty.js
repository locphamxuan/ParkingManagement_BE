/**
 * Migration 1 lần — Đặt lại overstayPenaltyPercent = 0 trên mọi ReservationPolicy.
 *
 * Lý do: Manager UI đã bỏ trường này (phí quá giờ tính theo chính sách giá thường,
 * không có % phạt riêng). Các document cũ trong DB có thể còn giá trị khác 0.
 *
 * Chạy: `node src/scripts/resetOverstayPenalty.js`
 */
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const ReservationPolicy = require('../models/policy/ReservationPolicy');
const logger = require('../utils/logger');

(async () => {
  try {
    await connectDB();

    const affected = await ReservationPolicy.countDocuments({
      overstayPenaltyPercent: { $gt: 0 },
    });
    logger.info(`[migration] Tìm thấy ${affected} ReservationPolicy có overstayPenaltyPercent > 0.`);

    if (affected > 0) {
      const result = await ReservationPolicy.updateMany(
        { overstayPenaltyPercent: { $gt: 0 } },
        { $set: { overstayPenaltyPercent: 0 } },
      );
      logger.info(`[migration] Đã reset ${result.modifiedCount} document về 0.`);
    } else {
      logger.info('[migration] Không có document nào cần cập nhật.');
    }

    logger.info('[migration] Hoàn tất.');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    logger.error('[migration] Lỗi:', err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
})();
