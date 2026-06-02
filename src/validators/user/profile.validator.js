const AppError = require('../../utils/AppError');

const PHONE_REGEX = /^[0-9+\-\s()]{8,20}$/;

const validateUpdateProfile = (req, _res, next) => {
  const { phone } = req.body;
  if (phone !== undefined && phone && !PHONE_REGEX.test(phone)) {
    return next(new AppError('Invalid phone number format', 400));
  }
  next();
};

const validateChangePassword = (req, _res, next) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword) return next(new AppError('currentPassword is required', 400));
  if (!newPassword || newPassword.length < 6) {
    return next(new AppError('newPassword must be at least 6 characters', 400));
  }
  next();
};

module.exports = { validateUpdateProfile, validateChangePassword };
