/**
 * Migration 1 lần — Gói dài hạn chuyển sang "floating" (không giữ slot cố định).
 *
 * Nhả mọi ParkingSlot đang bị một LongTermSubscription giữ (status 'reserved' do
 * gói) về 'available', và xoá tham chiếu slot trên subscription.
 *
 * Chạy: `node src/scripts/releasePackageSlots.js`
 */
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const LongTermSubscription = require('../models/policy/LongTermSubscription');
const ParkingSlot = require('../models/building/ParkingSlot');
const logger = require('../utils/logger');

(async () => {
  try {
    await connectDB();

    // Subscription cũ có thể vẫn còn field `slot` (dù schema mới đã bỏ) — đọc raw.
    const subs = await LongTermSubscription.find(
      { slot: { $ne: null } },
      { slot: 1 },
    ).lean();

    const slotIds = [...new Set(subs.map((s) => String(s.slot)).filter(Boolean))];
    logger.info(`[migration] ${subs.length} subscription giữ slot, ${slotIds.length} slot cần nhả.`);

    if (slotIds.length) {
      const res = await ParkingSlot.updateMany(
        { _id: { $in: slotIds }, status: 'reserved' },
        { $set: { status: 'available' } },
      );
      logger.info(`[migration] Đã nhả ${res.modifiedCount} slot về 'available'.`);
    }

    // Xoá tham chiếu slot + cờ grace cũ trên subscription (dọn dữ liệu thừa).
    const cleaned = await LongTermSubscription.updateMany(
      {},
      { $unset: { slot: '', slotReleased: '', lastGraceReminderAt: '' } },
    );
    logger.info(`[migration] Dọn field slot/grace trên ${cleaned.modifiedCount} subscription.`);

    logger.info('[migration] Hoàn tất.');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    logger.error('[migration] Lỗi:', err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
})();
