const env = require('../../config/env');
const AppError = require('../../utils/AppError');
const Vehicle = require('../../models/vehicle/Vehicle');
const { generateVehicleQrCode } = require('../../models/vehicle/Vehicle');

/**
 * Vòng đời mã QR phương tiện — NƠI DUY NHẤT định nghĩa "QR còn dùng được hay không".
 *
 * Mã QR hết hạn sau `VEHICLE_QR_TTL_DAYS` ngày (mặc định 2). Hạn dùng là cấu hình
 * của HỆ THỐNG chứ không phải của từng tòa nhà: một chiếc xe dùng chung một mã ở
 * mọi tòa, nên nếu mỗi tòa tự đặt hạn thì không thể xác định hạn nào đang áp dụng.
 *
 * Cơ chế "tự expire" gồm hai nửa, không cần cron:
 *  - Nửa CHẶN : mọi lần quét (kiosk, staff) đều đi qua `resolveScannedQr` → mã quá
 *    hạn bị từ chối ngay.
 *  - Nửa CẤP LẠI : khi chủ xe mở mã trong app, `ensureFreshQr` thấy quá hạn thì
 *    sinh token mới + gia hạn. Khách không bao giờ phải thao tác thủ công, mà mã
 *    bị chụp trộm cũng chỉ sống tối đa 2 ngày.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const qrTtlMs = () => env.vehicleQrTtlDays * MS_PER_DAY;

const nextExpiry = (from = new Date()) => new Date(from.getTime() + qrTtlMs());

/**
 * Mã đã hết hiệu lực chưa. Thiếu `qrExpiresAt` (dữ liệu có trước khi áp TTL) cũng
 * coi là hết hạn → lần mở app kế tiếp sẽ được cấp mã có hạn đàng hoàng.
 */
const isQrExpired = (vehicle, now = new Date()) => {
  const expiresAt = vehicle?.qrExpiresAt;
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() <= now.getTime();
};

/** Gán token + mốc hạn mới lên document (chưa lưu). */
const stampNewQr = (vehicle, now = new Date()) => {
  vehicle.qrCode = generateVehicleQrCode();
  vehicle.qrIssuedAt = now;
  vehicle.qrExpiresAt = nextExpiry(now);
  return vehicle;
};

/**
 * Trả về chiếc xe với mã QR chắc chắn còn hạn — cấp lại tại chỗ nếu đã quá hạn.
 * Dùng cho mọi đường đọc mã của CHỦ XE (danh sách xe, modal QR).
 */
const ensureFreshQr = async (vehicle, now = new Date()) => {
  if (!vehicle || !isQrExpired(vehicle, now)) return vehicle;
  stampNewQr(vehicle, now);
  await vehicle.save();
  return vehicle;
};

const ensureFreshQrForAll = async (vehicles, now = new Date()) =>
  Promise.all(vehicles.map((vehicle) => ensureFreshQr(vehicle, now)));

/** Chủ xe bấm "Cấp lại mã" — huỷ token cũ ngay lập tức kể cả khi chưa hết hạn. */
const rotateQr = async (ownerId, vehicleId) => {
  const vehicle = await Vehicle.findOne({ _id: vehicleId, owner: ownerId });
  if (!vehicle) throw new AppError('Không tìm thấy phương tiện', 404, 'VEHICLE_NOT_FOUND');
  stampNewQr(vehicle);
  await vehicle.save();
  return vehicle;
};

/**
 * Giải mã token vừa quét ở cổng/kiosk thành chiếc xe tương ứng.
 * Mã không tồn tại → 404; mã quá hạn → 410 (khách cần mở app để lấy mã mới).
 */
const resolveScannedQr = async (token, mongoSession = null) => {
  const value = `${token || ''}`.trim();
  if (!value) {
    throw new AppError('Vui lòng quét mã QR phương tiện.', 400, 'VEHICLE_QR_REQUIRED');
  }

  const query = Vehicle.findOne({ qrCode: value });
  if (mongoSession) query.session(mongoSession);
  const vehicle = await query;

  if (!vehicle) {
    throw new AppError(
      'Mã QR không hợp lệ hoặc chưa đăng ký. Vui lòng gặp nhân viên để check-in.',
      404,
      'VEHICLE_QR_NOT_FOUND'
    );
  }
  if (isQrExpired(vehicle)) {
    throw new AppError(
      `Mã QR đã hết hạn (hiệu lực ${env.vehicleQrTtlDays} ngày). Vui lòng mở ứng dụng để lấy mã mới.`,
      410,
      'VEHICLE_QR_EXPIRED'
    );
  }
  return vehicle;
};

module.exports = {
  qrTtlDays: () => env.vehicleQrTtlDays,
  nextExpiry,
  isQrExpired,
  stampNewQr,
  ensureFreshQr,
  ensureFreshQrForAll,
  rotateQr,
  resolveScannedQr,
};
