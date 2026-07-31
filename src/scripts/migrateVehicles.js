/**
 * Migration 1 lần — Tách phương tiện thành collection `Vehicle`.
 *
 * 1) Backfill `VehicleType.category`: danh mục loại xe của từng tòa trước đây không
 *    khai báo nó thuộc thể loại xe nào, nên check-in phải ĐOÁN bằng regex tên/mã.
 *    Script này chạy phép đoán đó ĐÚNG MỘT LẦN rồi ghi kết quả xuống DB — sau đó
 *    code chạy hằng ngày chỉ đọc `category`, không còn regex.
 * 2) Chuyển `User.licensePlates[]` (mảng nhúng) → document `Vehicle` riêng, giữ
 *    nguyên qrCode cũ để mã QR khách đang dùng không chết.
 * 3) Báo cáo biển số trùng giữa nhiều tài khoản — unique index mới sẽ chặn, nên
 *    phải xử lý tay trước khi chạy thật.
 *
 * Chạy thử (không ghi):  node src/scripts/migrateVehicles.js --dry-run
 * Chạy thật:             node src/scripts/migrateVehicles.js
 */
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/user/User');
const VehicleType = require('../models/building/VehicleType');
const Vehicle = require('../models/vehicle/Vehicle');
const { plateCoreOf, generateVehicleQrCode } = require('../models/vehicle/Vehicle');
const { normalizePlate, isValidVietnamPlate } = require('../utils/plate.util');
const { isVehicleCategory, DEFAULT_VEHICLE_CATEGORY } = require('../constants/vehicle');
const logger = require('../utils/logger');

const dryRun = process.argv.includes('--dry-run');

/** Phép đoán cũ, CHỈ dùng ở đây để backfill dữ liệu lịch sử một lần duy nhất. */
const guessCategoryFromLegacyType = (vehicleType) => {
  const haystack = `${vehicleType.code || ''} ${vehicleType.name || ''}`.toLowerCase();
  if (/truck|tải|tai\b/.test(haystack)) return 'truck';
  if (/suv|7 ch|7ch/.test(haystack)) return 'suv';
  if (/đạp điện|dap dien|ebike|e-bike/.test(haystack)) return 'ebike';
  if (/máy điện|may dien|emotor|xe điện/.test(haystack)) return 'emotorbike';
  if (/motor|xe m|máy|may\b|bike|moto/.test(haystack)) return 'motorcycle';
  if (/ô t|o t|oto|car|auto|sedan|4 ch/.test(haystack)) return 'car';
  return DEFAULT_VEHICLE_CATEGORY;
};

const backfillVehicleTypeCategories = async () => {
  const pending = await VehicleType.find({
    $or: [{ category: { $exists: false } }, { category: null }],
  });
  logger.info(`[migration] ${pending.length} VehicleType chưa có category.`);

  for (const vehicleType of pending) {
    const category = guessCategoryFromLegacyType(vehicleType);
    logger.info(
      `[migration]   ${vehicleType.code} / "${vehicleType.name}" → category=${category}`
    );
    if (!dryRun) {
      await VehicleType.updateOne({ _id: vehicleType._id }, { $set: { category } });
    }
  }
  return pending.length;
};

const migrateUserPlates = async () => {
  const owners = await User.find({ 'licensePlates.0': { $exists: true } })
    .select('_id licensePlates')
    .lean();

  const seenCores = new Map(); // plateCore → userId đầu tiên giữ biển đó
  const conflicts = [];
  const invalid = [];
  let created = 0;
  let skipped = 0;

  for (const owner of owners) {
    for (const plate of owner.licensePlates || []) {
      const plateNumber = normalizePlate(plate.plateNumber);
      if (!plateNumber || !isValidVietnamPlate(plateNumber)) {
        invalid.push({ user: `${owner._id}`, raw: plate.plateNumber });
        continue;
      }

      const core = plateCoreOf(plateNumber);
      const firstOwner = seenCores.get(core);
      if (firstOwner && firstOwner !== `${owner._id}`) {
        conflicts.push({ plateNumber, owners: [firstOwner, `${owner._id}`] });
        continue;
      }
      seenCores.set(core, `${owner._id}`);

      // Idempotent: chạy lại nhiều lần không tạo bản ghi trùng.
      const exists = await Vehicle.findOne({ plateCore: core }).select('_id').lean();
      if (exists) {
        skipped += 1;
        continue;
      }

      const category = isVehicleCategory(plate.vehicleType)
        ? `${plate.vehicleType}`.toLowerCase()
        : DEFAULT_VEHICLE_CATEGORY;

      if (!dryRun) {
        await Vehicle.create({
          owner: owner._id,
          plateNumber,
          category,
          brand: plate.brand || null,
          isDefault: Boolean(plate.isDefault),
          // Giữ nguyên token QR cũ để mã khách đã lưu vẫn quét được.
          qrCode: plate.qrCode || generateVehicleQrCode(),
          qrIssuedAt: new Date(),
          // qrExpiresAt để null → lần đầu khách mở QR, hệ thống sẽ cấp hạn mới.
          qrExpiresAt: null,
        });
      }
      created += 1;
    }
  }

  return { created, skipped, conflicts, invalid, ownerCount: owners.length };
};

(async () => {
  try {
    await connectDB();
    if (dryRun) logger.info('[migration] DRY-RUN — không ghi gì xuống DB.');

    const backfilled = await backfillVehicleTypeCategories();
    const result = await migrateUserPlates();

    logger.info(
      `[migration] VehicleType backfill: ${backfilled} | Vehicle tạo mới: ${result.created} | ` +
        `bỏ qua (đã có): ${result.skipped} | chủ xe quét: ${result.ownerCount}`
    );

    if (result.invalid.length) {
      logger.warn(
        `[migration] ${result.invalid.length} biển số sai định dạng, KHÔNG chuyển: ` +
          result.invalid.map((i) => `${i.raw} (user ${i.user})`).join(', ')
      );
    }
    if (result.conflicts.length) {
      logger.error(
        `[migration] ${result.conflicts.length} biển số bị nhiều tài khoản cùng giữ — ` +
          'phải xử lý tay rồi chạy lại: ' +
          result.conflicts.map((c) => `${c.plateNumber} [${c.owners.join(' | ')}]`).join(', ')
      );
    }

    logger.info('[migration] Hoàn tất migrateVehicles.');
    await mongoose.connection.close();
    process.exit(result.conflicts.length ? 2 : 0);
  } catch (err) {
    logger.error('[migration] migrateVehicles lỗi:', err.message);
    process.exit(1);
  }
})();
