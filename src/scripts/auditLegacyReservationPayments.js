/**
 * READ-ONLY audit — bao nhiêu bản ghi tài chính LỊCH SỬ còn mang dấu vết của tính
 * năng đặt chỗ theo giờ (đã gỡ khỏi sản phẩm).
 *
 * Vì sao cần: `Payment.type='reservation'` và `BuildingWalletTransaction.reason=
 * 'reservation_fee'` vẫn nằm trong enum để đọc/aggregate được dữ liệu cũ. Chỉ khi
 * script này trả về 0 ở MỌI môi trường thật (staging + production) thì mới được
 * phép gỡ 2 giá trị enum đó và bỏ `LEGACY_REVENUE_PAYMENT_TYPES` khỏi
 * `constants/finance.js`.
 *
 * Script KHÔNG ghi/sửa/xoá bất kỳ document nào → không cần rollback. Không có
 * migration phá huỷ nào được cung cấp ở đây một cách chủ đích: nếu về sau cần
 * chuyển đổi dữ liệu cũ, phải là một thay đổi riêng, được review, kèm backup.
 *
 * Chạy: `node src/scripts/auditLegacyReservationPayments.js`
 * (dùng MONGODB_URI của môi trường đang trỏ tới — hãy kiểm tra trước khi chạy)
 */
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Payment = require('../models/finance/Payment');
const BuildingWalletTransaction = require('../models/finance/BuildingWalletTransaction');
const logger = require('../utils/logger');

const run = async () => {
  await connectDB();

  const [payments] = await Payment.aggregate([
    { $match: { type: 'reservation' } },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' },
        successCount: { $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } },
        firstAt: { $min: '$createdAt' },
        lastAt: { $max: '$createdAt' },
      },
    },
  ]);

  const walletEntries = await BuildingWalletTransaction.countDocuments({ reason: 'reservation_fee' });

  const report = {
    reservationPayments: payments?.count || 0,
    reservationPaymentsSuccessful: payments?.successCount || 0,
    reservationPaymentsAmount: payments?.totalAmount || 0,
    reservationPaymentsFirstAt: payments?.firstAt || null,
    reservationPaymentsLastAt: payments?.lastAt || null,
    reservationWalletEntries: walletEntries,
    safeToDropLegacyEnums: !(payments?.count || 0) && !walletEntries,
  };

  logger.info('[auditLegacyReservationPayments]', JSON.stringify(report, null, 2));
  await mongoose.connection.close();
  return report;
};

if (require.main === module) {
  run().catch(async (error) => {
    logger.error('[auditLegacyReservationPayments] failed:', error.message);
    await mongoose.connection.close().catch(() => {});
    process.exitCode = 1;
  });
}

module.exports = { run };
