const mongoose = require('mongoose');
const User = require('../../models/user/User');
const { generatePlateQrCode } = require('../../models/user/User');
const LongTermSubscription = require('../../models/policy/LongTermSubscription');
const ParkingSession = require('../../models/operations/ParkingSession');
const AppError = require('../../utils/AppError');
const { normalizePlate, isValidVietnamPlate, plateMatchRegex } = require('../../utils/plate.util');

const MAX_PLATES_PER_USER = 5;

const list = async (userId) => {
  const user = await User.findById(userId).select('licensePlates');
  if (!user) throw new AppError('User not found', 404);

  // Backfill QR tokens for plates created before this feature existed.
  let needsSave = false;
  user.licensePlates.forEach((p) => {
    if (!p.qrCode) {
      p.qrCode = generatePlateQrCode();
      needsSave = true;
    }
  });
  if (needsSave) await user.save();

  return user.licensePlates;
};

const add = async (userId, { plateNumber, vehicleType, brand }) => {
  const user = await User.findById(userId).select('licensePlates');
  if (!user) throw new AppError('User not found', 404);

  if (user.licensePlates.length >= MAX_PLATES_PER_USER) {
    throw new AppError(`Đã đạt giới hạn ${MAX_PLATES_PER_USER} biển số xe`, 400);
  }

  const normalized = normalizePlate(plateNumber);
  if (!normalized || !isValidVietnamPlate(normalized)) {
    throw new AppError('Biển số xe không hợp lệ theo định dạng Việt Nam', 400, 'INVALID_PLATE_FORMAT');
  }
  const duplicate = user.licensePlates.some((p) => normalizePlate(p.plateNumber) === normalized);
  if (duplicate) throw new AppError('Biển số xe đã tồn tại trong danh sách', 409);

  const updated = await User.findByIdAndUpdate(
    userId,
    { $push: { licensePlates: { plateNumber: normalized, vehicleType: vehicleType || 'car', brand: brand || null, isDefault: false, qrCode: generatePlateQrCode() } } },
    { new: true, runValidators: true }
  ).select('licensePlates');

  return updated.licensePlates;
};

const update = async (userId, plateId, { vehicleType }) => {
  const owner = await User.findOne({ _id: userId, 'licensePlates._id': plateId })
    .select('licensePlates');
  const plate = owner?.licensePlates?.id(plateId);
  if (!plate) throw new AppError('License plate not found', 404);

  if (vehicleType && vehicleType !== plate.vehicleType) {
    const now = new Date();
    const [hasActiveSubscription, hasActiveSession] = await Promise.all([
      LongTermSubscription.exists({
        user: userId,
        plateNumber: plateMatchRegex(plate.plateNumber),
        status: 'active',
        startDate: { $lte: now },
        endDate: { $gte: now },
      }),
      ParkingSession.exists({
        user: userId,
        plateNumber: plateMatchRegex(plate.plateNumber),
        status: 'active',
      }),
    ]);
    if (hasActiveSubscription || hasActiveSession) {
      throw new AppError(
        'Cannot change vehicle type while this plate has an active package or parking session',
        409,
        'VEHICLE_TYPE_CONFLICT',
      );
    }
  }

  const result = await User.findOneAndUpdate(
    { _id: userId, 'licensePlates._id': plateId },
    { $set: { 'licensePlates.$.vehicleType': vehicleType } },
    { new: true, runValidators: true }
  ).select('licensePlates');

  if (!result) throw new AppError('Biển số xe không tìm thấy', 404);
  return result.licensePlates;
};

const remove = async (userId, plateId) => {
  const user = await User.findById(userId).select('licensePlates');
  if (!user) throw new AppError('User not found', 404);
  const plate = user.licensePlates.id(plateId);
  if (!plate) throw new AppError('License plate not found', 404);

  const now = new Date();
  const [hasActiveSubscription, hasActiveSession] = await Promise.all([
    LongTermSubscription.exists({
      user: userId,
      plateNumber: plateMatchRegex(plate.plateNumber),
      status: 'active',
      startDate: { $lte: now },
      endDate: { $gte: now },
    }),
    ParkingSession.exists({
      user: userId,
      plateNumber: plateMatchRegex(plate.plateNumber),
      status: 'active',
    }),
  ]);
  if (hasActiveSubscription) {
    throw new AppError(
      'Cannot remove a plate with an active long-term package',
      409,
      'PLATE_HAS_ACTIVE_SUBSCRIPTION',
    );
  }
  if (hasActiveSession) {
    throw new AppError(
      'Cannot remove a plate with an active parking session',
      409,
      'PLATE_HAS_ACTIVE_SESSION',
    );
  }

  const result = await User.findByIdAndUpdate(
    userId,
    { $pull: { licensePlates: { _id: plateId } } },
    { new: true }
  ).select('licensePlates');

  return result.licensePlates;
};

const setDefault = async (userId, plateId) => {
  if (!mongoose.Types.ObjectId.isValid(plateId)) {
    throw new AppError('Biển số xe không tìm thấy', 404);
  }
  const oid = new mongoose.Types.ObjectId(plateId);

  const updated = await User.findOneAndUpdate(
    { _id: userId, 'licensePlates._id': oid },
    {
      $set: {
        'licensePlates.$[other].isDefault': false,
        'licensePlates.$[target].isDefault': true,
      },
    },
    {
      arrayFilters: [{ 'other._id': { $ne: oid } }, { 'target._id': oid }],
      new: true,
    },
  ).select('licensePlates');

  if (!updated) throw new AppError('Biển số xe không tìm thấy', 404);
  return updated.licensePlates;
};

module.exports = { list, add, update, remove, setDefault };
