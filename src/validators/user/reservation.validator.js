const AppError = require('../../utils/AppError');

const validateCreateReservation = (req, _res, next) => {
  const { buildingId, vehicleTypeId, plateNumber, startTime, endTime } = req.body;

  if (!buildingId) return next(new AppError('buildingId is required', 400));
  if (!vehicleTypeId) return next(new AppError('vehicleTypeId is required', 400));
  if (!plateNumber?.trim()) return next(new AppError('plateNumber is required', 400));
  if (!startTime) return next(new AppError('startTime is required', 400));
  if (!endTime) return next(new AppError('endTime is required', 400));

  const start = new Date(startTime);
  const end = new Date(endTime);

  if (isNaN(start.getTime())) return next(new AppError('startTime is invalid', 400));
  if (isNaN(end.getTime())) return next(new AppError('endTime is invalid', 400));
  if (start >= end) return next(new AppError('startTime must be before endTime', 400));

  next();
};

module.exports = { validateCreateReservation };
