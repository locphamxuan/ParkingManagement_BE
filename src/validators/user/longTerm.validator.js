const mongoose = require('mongoose');
const AppError = require('../../utils/AppError');

const validateSubscribe = (req, _res, next) => {
  const { packageId, plateNumber, startDate } = req.body;
  if (!packageId) return next(new AppError('packageId is required', 400));
  if (!plateNumber?.trim()) return next(new AppError('plateNumber is required', 400));

  // Optional startDate – must be a valid date when provided
  if (startDate !== undefined && startDate !== null && startDate !== '') {
    const parsed = new Date(startDate);
    if (Number.isNaN(parsed.getTime())) {
      return next(new AppError('startDate must be a valid date', 400));
    }
  }

  req.body.plateNumber = plateNumber.trim().toUpperCase();
  next();
};

const validateRenew = (req, _res, next) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new AppError('subscriptionId không hợp lệ', 400));
  }
  next();
};

module.exports = { validateSubscribe, validateRenew };
