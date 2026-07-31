const AppError = require('../../utils/AppError');
const { findPasswordWeakness } = require('../../utils/passwordPolicy');

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
  const weakness = findPasswordWeakness(newPassword);
  if (weakness) return next(new AppError(weakness, 400, 'WEAK_PASSWORD'));
  next();
};

module.exports = { validateUpdateProfile, validateChangePassword };
