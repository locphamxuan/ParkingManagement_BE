const AppError = require('../../utils/AppError');

const validateSubscribe = (req, _res, next) => {
  const { packageId, plateNumber } = req.body;
  if (!packageId) return next(new AppError('packageId is required', 400));
  if (!plateNumber?.trim()) return next(new AppError('plateNumber is required', 400));
  req.body.plateNumber = plateNumber.trim().toUpperCase();
  next();
};

module.exports = { validateSubscribe };
