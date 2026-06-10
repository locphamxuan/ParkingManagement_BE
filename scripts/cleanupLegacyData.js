/**
 * cleanupLegacyData.js
 * Dọn dẹp dữ liệu cũ còn sót lại sau các đợt refactor:
 *  1. Bảng giá (PricePolicy): xoá policy loại 'holiday'; bỏ các trường đã loại bỏ
 *     (minRate, maxRate, dailyCap, holidayDates).
 *  2. Ô đỗ (ParkingSlot): bỏ vehicleType per-slot (loại xe giờ lấy theo TẦNG).
 *  3. Bỏ hẳn collection 'feedbacks' (tính năng feedback đã gỡ).
 *  4. Xoá StaffShift mồ côi (staff/shift không còn tồn tại).
 *
 * Chạy: node scripts/cleanupLegacyData.js
 * Chỉ in báo cáo (không xoá) khi thêm cờ --dry:
 *        node scripts/cleanupLegacyData.js --dry
 */

const mongoose = require('mongoose');
const env = require('../src/config/env');

const DRY = process.argv.includes('--dry');

async function main() {
  await mongoose.connect(env.mongodbUri);
  console.log(`[cleanup] Connected: ${mongoose.connection.host} / ${mongoose.connection.name}`);
  console.log(DRY ? '[cleanup] DRY RUN — không thay đổi dữ liệu\n' : '[cleanup] Đang dọn dẹp...\n');

  const db = mongoose.connection.db;
  const PricePolicy = require('../src/models/policy/PricePolicy');
  const ParkingSlot = require('../src/models/building/ParkingSlot');
  const { StaffShift, Shift } = require('../src/models/operations');
  const User = require('../src/models/user/User');

  // ── 1. PricePolicy ──────────────────────────────────────────────────────────
  const holidayCount = await PricePolicy.countDocuments({ type: 'holiday' });
  const legacyFieldCount = await PricePolicy.countDocuments({
    $or: [
      { minRate: { $exists: true } },
      { maxRate: { $exists: true } },
      { dailyCap: { $exists: true } },
      { holidayDates: { $exists: true } },
    ],
  });
  console.log(`1) PricePolicy: holiday=${holidayCount}, có trường cũ=${legacyFieldCount}`);
  if (!DRY) {
    if (holidayCount) await PricePolicy.collection.deleteMany({ type: 'holiday' });
    // Dùng native collection để bỏ qua strict-mode (các field không còn trong schema).
    await PricePolicy.collection.updateMany(
      {},
      { $unset: { minRate: '', maxRate: '', dailyCap: '', holidayDates: '' } },
    );
  }

  // ── 2. ParkingSlot.vehicleType ──────────────────────────────────────────────
  const slotWithVt = await ParkingSlot.countDocuments({ vehicleType: { $ne: null } });
  console.log(`2) ParkingSlot có vehicleType riêng=${slotWithVt} → đặt null (lấy theo tầng)`);
  if (!DRY && slotWithVt) {
    await ParkingSlot.updateMany({ vehicleType: { $ne: null } }, { $set: { vehicleType: null } });
  }

  // ── 3. feedbacks collection ─────────────────────────────────────────────────
  const collections = await db.listCollections({ name: 'feedbacks' }).toArray();
  if (collections.length) {
    const n = await db.collection('feedbacks').countDocuments();
    console.log(`3) Collection 'feedbacks' tồn tại (${n} docs) → drop`);
    if (!DRY) await db.collection('feedbacks').drop().catch(() => {});
  } else {
    console.log("3) Collection 'feedbacks' không tồn tại — bỏ qua");
  }

  // ── 4. StaffShift mồ côi ────────────────────────────────────────────────────
  const staffShifts = await StaffShift.find().select('_id staff shift').lean();
  let orphan = 0;
  for (const ss of staffShifts) {
    const [u, sh] = await Promise.all([
      ss.staff ? User.exists({ _id: ss.staff }) : null,
      ss.shift ? Shift.exists({ _id: ss.shift }) : null,
    ]);
    if (!u || !sh) {
      orphan += 1;
      if (!DRY) await StaffShift.deleteOne({ _id: ss._id });
    }
  }
  console.log(`4) StaffShift mồ côi=${orphan} (tổng ${staffShifts.length})`);

  console.log(`\n[cleanup] ${DRY ? 'DRY RUN hoàn tất.' : 'Hoàn tất dọn dẹp.'}`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('[cleanup] LỖI:', err);
  process.exit(1);
});
