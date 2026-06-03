const AppError = require('../utils/AppError');

const EMAIL_REGEX = /^\S+@\S+\.\S+$/;
const PHONE_REGEX = /^[0-9+\-\s()]{8,20}$/;
const OTP_REGEX = /^\d{6}$/;

const validateRegister = (req, _res, next) => {
  const { email, password, fullName, phone } = req.body;

  if (!email?.trim() || !EMAIL_REGEX.test(email)) {
    return next(new AppError('Valid email is required', 400));
  }
  if (!password || password.length < 6) {
    return next(new AppError('Password must be at least 6 characters', 400));
  }
  if (!fullName?.trim()) {
    return next(new AppError('Full name is required', 400));
  }
  if (phone && !PHONE_REGEX.test(phone)) {
    return next(new AppError('Invalid phone number', 400));
  }

  req.body.email = email.trim().toLowerCase();
  req.body.fullName = fullName.trim();
  next();
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
  if (!newPassword || newPassword.length < 6) {
    return next(new AppError('Password must be at least 6 characters', 400));
  }
  next();
};

const validateRegisterRequest = (req, _res, next) => {
  const { email, password, fullName, phone } = req.body;

  if (!email?.trim() || !EMAIL_REGEX.test(email)) {
    return next(new AppError('Valid email is required', 400));
  }
  if (!password || password.length < 6) {
    return next(new AppError('Password must be at least 6 characters', 400));
  }
  if (!fullName?.trim()) {
    return next(new AppError('Full name is required', 400));
  }
  if (phone && !PHONE_REGEX.test(phone)) {
    return next(new AppError('Invalid phone number', 400));
  }

  req.body.email = email.trim().toLowerCase();
  req.body.fullName = fullName.trim();
  next();
};

const validateRegisterVerify = (req, _res, next) => {
  const { email, otp } = req.body;

  if (!email?.trim() || !EMAIL_REGEX.test(email)) {
    return next(new AppError('Valid email is required', 400));
  }
  if (!otp?.trim() || !OTP_REGEX.test(otp.trim())) {
    return next(new AppError('OTP must be a 6-digit number', 400));
  }

  req.body.email = email.trim().toLowerCase();
  req.body.otp = otp.trim();
  next();
};

module.exports = { validateRegister, validateLogin, validateForgotPassword, validateResetPassword, validateRegisterRequest, validateRegisterVerify };
