const User = require('../../models/user/User');
const { generatePlateQrCode } = require('../../models/user/User');
const AppError = require('../../utils/AppError');

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

const add = async (userId, { plateNumber, vehicleType }) => {
  const user = await User.findById(userId).select('licensePlates');
  if (!user) throw new AppError('User not found', 404);

  if (user.licensePlates.length >= MAX_PLATES_PER_USER) {
    throw new AppError(`Đã đạt giới hạn ${MAX_PLATES_PER_USER} biển số xe`, 400);
  }

  const normalized = String(plateNumber).trim().toUpperCase();
  const duplicate = user.licensePlates.some((p) => p.plateNumber === normalized);
  if (duplicate) throw new AppError('Biển số xe đã tồn tại trong danh sách', 409);

  const updated = await User.findByIdAndUpdate(
    userId,
    { $push: { licensePlates: { plateNumber: normalized, vehicleType: vehicleType || 'car', isDefault: false, qrCode: generatePlateQrCode() } } },
    { new: true, runValidators: true }
  ).select('licensePlates');

  return updated.licensePlates;
};

const update = async (userId, plateId, { vehicleType }) => {
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
  if (!user.licensePlates.id(plateId)) throw new AppError('Biển số xe không tìm thấy', 404);

  const result = await User.findByIdAndUpdate(
    userId,
    { $pull: { licensePlates: { _id: plateId } } },
    { new: true }
  ).select('licensePlates');

  return result.licensePlates;
};

const setDefault = async (userId, plateId) => {
  const user = await User.findById(userId).select('licensePlates');
  if (!user) throw new AppError('User not found', 404);

  const plate = user.licensePlates.id(plateId);
  if (!plate) throw new AppError('Biển số xe không tìm thấy', 404);

  user.licensePlates.forEach((p) => { p.isDefault = false; });
  user.licensePlates.id(plateId).isDefault = true;
  await user.save();

  return user.licensePlates;
};

module.exports = { list, add, update, remove, setDefault };
