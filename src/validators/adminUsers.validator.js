const AppError = require('../utils/AppError');

const validateUserStatus = (req, _res, next) => {
  const { isActive } = req.body;

  if (isActive === undefined) {
    return next(new AppError('isActive is required', 400));
  }

  if (typeof isActive !== 'boolean') {
    return next(new AppError('isActive must be a boolean', 400));
  }

  next();
};

module.exports = { validateUserStatus };
