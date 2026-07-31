const AppError = require('../utils/AppError');
const { findPasswordWeakness } = require('../utils/passwordPolicy');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[0-9+\-\s()]{8,20}$/;
const OTP_REGEX = /^\d{6}$/;

// Server is authoritative on password strength; clients mirror the message only.
const rejectWeakPassword = (password, next) => {
  const weakness = findPasswordWeakness(password);
  if (weakness) {
    next(new AppError(weakness, 400, 'WEAK_PASSWORD'));
    return true;
  }
  return false;
};

const validateLogin = (req, _res, next) => {
  const { email, password } = req.body;

  if (!email?.trim() || !password) {
    return next(new AppError('Email and password are required', 400));
  }

  req.body.email = email.trim().toLowerCase();
  next();
};

const validateForgotPassword = (req, _res, next) => {
  const { email } = req.body;
  if (!email?.trim() || !EMAIL_REGEX.test(email)) {
    return next(new AppError('Valid email is required', 400));
  }
  req.body.email = email.trim().toLowerCase();
  next();
};

const validateResetPassword = (req, _res, next) => {
  const { token, newPassword } = req.body;
  if (!token?.trim()) {
    return next(new AppError('Token is required', 400));
  }
  if (rejectWeakPassword(newPassword, next)) return undefined;
  next();
};

/**
 * Step 1 of OTP registration. Deliberately does NOT accept a password — it is
 * sent only with the verified step so it is never persisted pre-verification.
 */
const validateRegisterRequest = (req, _res, next) => {
  const { email, fullName, phone } = req.body;

  if (!email?.trim() || !EMAIL_REGEX.test(email)) {
    return next(new AppError('Valid email is required', 400));
  }
  if (!fullName?.trim()) {
    return next(new AppError('Full name is required', 400));
  }
  if (phone && !PHONE_REGEX.test(phone)) {
    return next(new AppError('Invalid phone number', 400));
  }

  req.body.email = email.trim().toLowerCase();
  req.body.fullName = fullName.trim();
  delete req.body.password;
  next();
};

const validateRegisterVerify = (req, _res, next) => {
  const { email, otp, password } = req.body;

  if (!email?.trim() || !EMAIL_REGEX.test(email)) {
    return next(new AppError('Valid email is required', 400));
  }
  if (!otp?.trim() || !OTP_REGEX.test(otp.trim())) {
    return next(new AppError('OTP must be a 6-digit number', 400));
  }
  if (rejectWeakPassword(password, next)) return undefined;

  req.body.email = email.trim().toLowerCase();
  req.body.otp = otp.trim();
  next();
};

const validateForgotPasswordSms = (req, _res, next) => {
  const { phone } = req.body;
  if (!phone?.trim() || !PHONE_REGEX.test(phone.trim())) {
    return next(new AppError('Valid phone number is required', 400));
  }
  req.body.phone = phone.trim();
  next();
};

const validateResetPasswordSms = (req, _res, next) => {
  const { phone, otp, newPassword } = req.body;
  if (!phone?.trim() || !PHONE_REGEX.test(phone.trim())) {
    return next(new AppError('Valid phone number is required', 400));
  }
  if (!otp?.trim() || !OTP_REGEX.test(otp.trim())) {
    return next(new AppError('OTP must be a 6-digit number', 400));
  }
  if (rejectWeakPassword(newPassword, next)) return undefined;
  req.body.phone = phone.trim();
  req.body.otp = otp.trim();
  next();
};

module.exports = {
  validateLogin,
  validateForgotPassword,
  validateResetPassword,
  validateRegisterRequest,
  validateRegisterVerify,
  validateForgotPasswordSms,
  validateResetPasswordSms,
};
