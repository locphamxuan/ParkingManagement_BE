const AppError = require('../../utils/AppError');
const { normalizePlate, isValidVietnamPlate } = require('../../utils/plate.util');

const VEHICLE_TYPES = ['motorcycle', 'car', 'suv', 'truck', 'other'];

const validateAddPlate = (req, _res, next) => {
  const { plateNumber, vehicleType, brand } = req.body;
  if (!plateNumber?.trim()) return next(new AppError('plateNumber is required', 400));
  if (vehicleType && !VEHICLE_TYPES.includes(vehicleType)) {
    return next(new AppError(`vehicleType must be one of: ${VEHICLE_TYPES.join(', ')}`, 400));
  }
  const normalized = normalizePlate(plateNumber);
  if (!isValidVietnamPlate(normalized)) {
    return next(
      new AppError(
        'Biển số không hợp lệ. Định dạng Việt Nam, ví dụ: 59G2-038.80',
        400,
        'INVALID_PLATE_FORMAT'
      )
    );
  }
  req.body.plateNumber = normalized;
  // brand is optional; trim and cap length, normalize empty → null.
  const trimmedBrand = typeof brand === 'string' ? brand.trim() : '';
  if (trimmedBrand.length > 50) {
    return next(new AppError('Hãng xe không được vượt quá 50 ký tự', 400));
  }
  req.body.brand = trimmedBrand || null;
  next();
};

const validateUpdatePlate = (req, _res, next) => {
  const { vehicleType } = req.body;
  if (!vehicleType) return next(new AppError('vehicleType is required', 400));
  if (!VEHICLE_TYPES.includes(vehicleType)) {
    return next(new AppError(`vehicleType must be one of: ${VEHICLE_TYPES.join(', ')}`, 400));
  }
  next();
};

module.exports = { validateAddPlate, validateUpdatePlate };
