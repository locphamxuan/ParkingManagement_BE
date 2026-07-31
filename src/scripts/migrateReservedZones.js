/**
 * Migration 1 lần — Bỏ chức năng đặt chỗ (reservation).
 *
 * Chuyển mọi Zone và ParkingSlot có usageType 'reserved' (dãy dành cho đặt chỗ trước)
 * sang 'registered' (user có tài khoản), vì đối tượng 'reserved' không còn tồn tại.
 * Đồng thời nhả các slot đang ở status 'reserved' DO đặt chỗ (không thuộc gói dài hạn)
 * về 'available'.
 *
 * Chạy: `node src/scripts/migrateReservedZones.js`
 */
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Zone = require('../models/building/Zone');
const ParkingSlot = require('../models/building/ParkingSlot');
const LongTermSubscription = require('../models/policy/LongTermSubscription');
const logger = require('../utils/logger');

(async () => {
  try {
    await connectDB();

    // 1) Dãy 'reserved' → 'registered'.
    const zoneRes = await Zone.updateMany(
      { usageType: 'reserved' },
      { $set: { usageType: 'registered' } },
    );
    logger.info(`[migration] ${zoneRes.modifiedCount} zone 'reserved' → 'registered'.`);

    // 2) Slot denormalize usageType 'reserved' → 'registered'.
    const slotUsageRes = await ParkingSlot.updateMany(
      { usageType: 'reserved' },
      { $set: { usageType: 'registered' } },
    );
    logger.info(`[migration] ${slotUsageRes.modifiedCount} slot usageType 'reserved' → 'registered'.`);

    // 3) Nhả các slot đang status 'reserved' KHÔNG thuộc gói dài hạn (do đặt chỗ cũ).
    //    Slot status 'reserved' của gói (subscription.slot) được giữ nguyên.
    const heldByPackage = await LongTermSubscription.find(
      { slot: { $ne: null }, status: 'active' },
      { slot: 1 },
    ).lean();
    const keepSlotIds = heldByPackage.map((s) => String(s.slot)).filter(Boolean);

    const freed = await ParkingSlot.updateMany(
      { status: 'reserved', _id: { $nin: keepSlotIds } },
      { $set: { status: 'available' } },
    );
    logger.info(`[migration] Đã nhả ${freed.modifiedCount} slot 'reserved' (đặt chỗ cũ) về 'available'.`);

    logger.info('[migration] Hoàn tất migrateReservedZones.');
    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    logger.error('[migration] migrateReservedZones lỗi:', err.message);
    process.exit(1);
  }
})();
