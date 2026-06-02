const AppError = require('../../utils/AppError');

const validateCreateReservation = (req, _res, next) => {
  const { buildingId, vehicleTypeId, vehicleType, plateNumber, startTime, endTime } = req.body;

  if (!buildingId) return next(new AppError('buildingId is required', 400));
  if (!vehicleTypeId && !vehicleType) return next(new AppError('vehicleTypeId or vehicleType is required', 400));
  if (!plateNumber?.trim()) return next(new AppError('plateNumber is required', 400));
  if (!startTime) return next(new AppError('startTime is required', 400));

  const start = new Date(startTime);
  if (isNaN(start.getTime())) return next(new AppError('startTime is invalid', 400));

  if (endTime) {
    const end = new Date(endTime);
    if (isNaN(end.getTime())) return next(new AppError('endTime is invalid', 400));
    if (start >= end) return next(new AppError('startTime must be before endTime', 400));
  }

  next();
};

module.exports = { validateCreateReservation };
