const mongoose = require('mongoose');
const Vehicle = require('../../models/vehicle/Vehicle');
const { plateCoreOf } = require('../../models/vehicle/Vehicle');
const LongTermSubscription = require('../../models/policy/LongTermSubscription');
const ParkingSession = require('../../models/operations/ParkingSession');
const AppError = require('../../utils/AppError');
const { normalizePlate, isValidVietnamPlate, plateMatchRegex } = require('../../utils/plate.util');
const { assertCategoryMatchesPlate } = require('../../utils/vehicleRules');
const { ensureFreshQr, ensureFreshQrForAll, stampNewQr } = require('./vehicleQr.service');

const MAX_VEHICLES_PER_USER = 5;

/** Các thuộc tính mô tả chiếc xe mà chủ xe được sửa tự do (không ảnh hưởng giá/ô đỗ). */
const DESCRIPTIVE_FIELDS = ['brand'];

const sortedForOwner = (query) => query.sort({ isDefault: -1, createdAt: 1 });

const findOwnedVehicle = async (ownerId, vehicleId) => {
  if (!mongoose.Types.ObjectId.isValid(vehicleId)) {
    throw new AppError('Không tìm thấy phương tiện', 404, 'VEHICLE_NOT_FOUND');
  }
  const vehicle = await Vehicle.findOne({ _id: vehicleId, owner: ownerId });
  if (!vehicle) throw new AppError('Không tìm thấy phương tiện', 404, 'VEHICLE_NOT_FOUND');
  return vehicle;
};

/**
 * Xe có đang "bị khoá" bởi nghiệp vụ đang chạy không — dùng chung cho cả đổi thể loại
 * lẫn xoá xe, để hai đường không bao giờ lệch nhau về định nghĩa "đang sử dụng".
 */
const findActiveUsage = async (ownerId, plateNumber) => {
  const now = new Date();
  const plateRx = plateMatchRegex(plateNumber) || plateNumber;
  const [subscription, session] = await Promise.all([
    LongTermSubscription.exists({
      user: ownerId,
      plateNumber: plateRx,
      status: 'active',
      startDate: { $lte: now },
      endDate: { $gte: now },
    }),
    ParkingSession.exists({ user: ownerId, plateNumber: plateRx, status: 'active' }),
  ]);
  return { hasActiveSubscription: Boolean(subscription), hasActiveSession: Boolean(session) };
};

const list = async (ownerId) => {
  const vehicles = await sortedForOwner(Vehicle.find({ owner: ownerId }));
  // Mã QR quá hạn được cấp lại ngay khi chủ xe mở danh sách — khách luôn thấy mã dùng được.
  return ensureFreshQrForAll(vehicles);
};

const getOne = async (ownerId, vehicleId) => {
  const vehicle = await findOwnedVehicle(ownerId, vehicleId);
  return ensureFreshQr(vehicle);
};

const add = async (ownerId, payload) => {
  const count = await Vehicle.countDocuments({ owner: ownerId });
  if (count >= MAX_VEHICLES_PER_USER) {
    throw new AppError(`Đã đạt giới hạn ${MAX_VEHICLES_PER_USER} phương tiện`, 400, 'VEHICLE_LIMIT_REACHED');
  }

  const plateNumber = normalizePlate(payload.plateNumber);
  if (!plateNumber || !isValidVietnamPlate(plateNumber)) {
    throw new AppError('Biển số xe không hợp lệ theo định dạng Việt Nam', 400, 'INVALID_PLATE_FORMAT');
  }

  // Unique index trên plateCore mới là thứ bảo đảm thật sự; kiểm tra trước chỉ để
  // trả thông báo dễ hiểu thay vì lỗi duplicate-key thô của Mongo.
  const existing = await Vehicle.findOne({ plateCore: plateCoreOf(plateNumber) }).select('owner');
  if (existing) {
    throw new AppError(
      `${existing.owner}` === `${ownerId}`
        ? 'Biển số xe đã tồn tại trong danh sách'
        : 'Biển số này đã gắn với một tài khoản khác. Vui lòng liên hệ hỗ trợ nếu bạn là chủ xe.',
      409,
      `${existing.owner}` === `${ownerId}` ? 'VEHICLE_ALREADY_EXISTS' : 'PLATE_OWNED_BY_ANOTHER_USER'
    );
  }

  const vehicle = new Vehicle({
    owner: ownerId,
    plateNumber,
    category: payload.category,
    brand: payload.brand ?? null,
    // Xe đầu tiên của tài khoản mặc nhiên là xe mặc định.
    isDefault: count === 0,
  });
  stampNewQr(vehicle);

  try {
    await vehicle.save();
  } catch (err) {
    if (err?.code === 11000) {
      throw new AppError('Biển số này đã được đăng ký', 409, 'PLATE_OWNED_BY_ANOTHER_USER');
    }
    throw err;
  }
  return vehicle;
};

const update = async (ownerId, vehicleId, payload) => {
  const vehicle = await findOwnedVehicle(ownerId, vehicleId);

  // Đổi thể loại xe làm thay đổi bảng giá và ô đỗ tương thích → cấm đổi khi xe đang
  // trong bãi hoặc đang gắn gói dài hạn còn hiệu lực.
  if (payload.category !== undefined && payload.category !== vehicle.category) {
    // Sửa xe cũng phải khớp sê-ri biển như lúc tạo, nếu không thì chỉ cần thêm xe
    // đúng rồi sửa category là lách được ràng buộc.
    assertCategoryMatchesPlate(vehicle.plateNumber, payload.category);

    const { hasActiveSubscription, hasActiveSession } = await findActiveUsage(
      ownerId,
      vehicle.plateNumber
    );
    if (hasActiveSubscription || hasActiveSession) {
      throw new AppError(
        'Không thể đổi thể loại xe khi xe đang gửi hoặc đang có gói dài hạn hiệu lực',
        409,
        'VEHICLE_CATEGORY_CONFLICT'
      );
    }
    vehicle.category = payload.category;
  }

  DESCRIPTIVE_FIELDS.forEach((field) => {
    if (payload[field] !== undefined) vehicle[field] = payload[field];
  });

  await vehicle.save();
  return vehicle;
};

const remove = async (ownerId, vehicleId) => {
  const vehicle = await findOwnedVehicle(ownerId, vehicleId);
  const { hasActiveSubscription, hasActiveSession } = await findActiveUsage(
    ownerId,
    vehicle.plateNumber
  );
  if (hasActiveSubscription) {
    throw new AppError(
      'Không thể xoá xe đang có gói dài hạn hiệu lực',
      409,
      'VEHICLE_HAS_ACTIVE_SUBSCRIPTION'
    );
  }
  if (hasActiveSession) {
    throw new AppError('Không thể xoá xe đang gửi trong bãi', 409, 'VEHICLE_HAS_ACTIVE_SESSION');
  }

  await Vehicle.deleteOne({ _id: vehicle._id });

  // Xoá xe mặc định → đề cử xe cũ nhất còn lại, tránh tài khoản không còn xe mặc định.
  if (vehicle.isDefault) {
    const next = await Vehicle.findOne({ owner: ownerId }).sort({ createdAt: 1 });
    if (next) {
      next.isDefault = true;
      await next.save();
    }
  }
  return list(ownerId);
};

const setDefault = async (ownerId, vehicleId) => {
  const vehicle = await findOwnedVehicle(ownerId, vehicleId);
  if (!vehicle.isDefault) {
    // Bỏ cờ cũ TRƯỚC khi gắn cờ mới — unique partial index chỉ cho phép một xe
    // mặc định mỗi chủ, đảo thứ tự sẽ dính lỗi duplicate-key.
    await Vehicle.updateMany({ owner: ownerId, isDefault: true }, { $set: { isDefault: false } });
    vehicle.isDefault = true;
    await vehicle.save();
  }
  return list(ownerId);
};

module.exports = {
  MAX_VEHICLES_PER_USER,
  list,
  getOne,
  add,
  update,
  remove,
  setDefault,
};
