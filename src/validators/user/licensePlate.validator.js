const AppError = require('../../utils/AppError');

const VEHICLE_TYPES = ['motorcycle', 'car', 'suv', 'truck', 'other'];

const validateAddPlate = (req, _res, next) => {
  const { plateNumber, vehicleType } = req.body;
  if (!plateNumber?.trim()) return next(new AppError('plateNumber is required', 400));
  if (vehicleType && !VEHICLE_TYPES.includes(vehicleType)) {
    return next(new AppError(`vehicleType must be one of: ${VEHICLE_TYPES.join(', ')}`, 400));
  }
  req.body.plateNumber = plateNumber.trim().toUpperCase();
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
