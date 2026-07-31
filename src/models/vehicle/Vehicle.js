const mongoose = require('mongoose');
const crypto = require('node:crypto');
const { normalizePlate, isValidVietnamPlate } = require('../../utils/plate.util');
const {
  VEHICLE_CATEGORY_CODES,
  DEFAULT_VEHICLE_CATEGORY,
} = require('../../constants/vehicle');

/**
 * Phương tiện của người dùng — collection riêng (trước đây là mảng nhúng
 * `User.licensePlates`). Tách ra để:
 *  - có UNIQUE INDEX thật trên biển số (một biển chỉ thuộc đúng một tài khoản),
 *    thay cho việc quét toàn bộ collection User mỗi lần thêm xe;
 *  - tra cứu xe độc lập với chủ xe (staff quét QR ở cổng chỉ cần chiếc xe).
 *
 * Chiếc xe chỉ mô tả bằng ba thứ nghiệp vụ cần: biển số (định danh), `category`
 * (thể loại — enum quyết định giá và ô đỗ) và hãng xe.
 */

/** Token QR mờ, gắn theo từng xe — staff/kiosk quét để nhận diện xe. */
const generateVehicleQrCode = () => `PLT-${crypto.randomBytes(8).toString('hex')}`;

/**
 * "Lõi" biển số: chỉ chữ và số. Dùng làm khoá unique để hai cách viết của CÙNG một
 * biển (`59G2-038.80`, `59G2 03880`) không thể lọt thành hai bản ghi khác nhau.
 */
const plateCoreOf = (raw) => `${raw || ''}`.toUpperCase().replace(/[^A-Z0-9]/g, '');

const vehicleSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'owner is required'],
      index: true,
    },
    plateNumber: {
      type: String,
      required: [true, 'plateNumber is required'],
      uppercase: true,
      trim: true,
      maxlength: 20,
      validate: {
        validator: isValidVietnamPlate,
        message: 'Biển số không hợp lệ (định dạng Việt Nam, ví dụ: 59G2-038.80)',
      },
    },
    // Dẫn xuất từ plateNumber trong hook pre-validate — không set tay từ ngoài.
    plateCore: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    category: {
      type: String,
      enum: {
        values: [...VEHICLE_CATEGORY_CODES],
        message: `category must be one of: ${VEHICLE_CATEGORY_CODES.join(', ')}`,
      },
      default: DEFAULT_VEHICLE_CATEGORY,
      required: true,
    },
    brand: { type: String, trim: true, maxlength: 50, default: null },
    isDefault: { type: Boolean, default: false },
    qrCode: {
      type: String,
      default: generateVehicleQrCode,
    },
    qrIssuedAt: { type: Date, default: () => new Date() },
    // Mốc hết hạn của token QR. null = chưa áp hạn (dữ liệu cũ trước khi có TTL).
    qrExpiresAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Một biển số chỉ thuộc đúng một tài khoản, bất kể cách viết dấu cách/dấu chấm.
vehicleSchema.index({ plateCore: 1 }, { unique: true });
vehicleSchema.index({ qrCode: 1 }, { unique: true, sparse: true });
// Mỗi chủ xe nhiều nhất MỘT xe mặc định.
vehicleSchema.index(
  { owner: 1, isDefault: 1 },
  { unique: true, partialFilterExpression: { isDefault: true } }
);

vehicleSchema.pre('validate', function syncDerivedPlate(next) {
  if (this.plateNumber) {
    const normalized = normalizePlate(this.plateNumber);
    if (normalized) this.plateNumber = normalized;
  }
  this.plateCore = plateCoreOf(this.plateNumber);
  next();
});

const Vehicle = mongoose.model('Vehicle', vehicleSchema);

module.exports = Vehicle;
module.exports.generateVehicleQrCode = generateVehicleQrCode;
module.exports.plateCoreOf = plateCoreOf;
