const AppError = require('../utils/AppError');

const EMAIL_REGEX = /^\S+@\S+\.\S+$/;
const PHONE_REGEX = /^[0-9+\-\s()]{8,20}$/;

const ALLOWED_REGISTER_ROLES = ['manager', 'staff'];

const validateRegister = (req, _res, next) => {
  const { email, password, fullName, phone, role } = req.body;

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
  if (role && !ALLOWED_REGISTER_ROLES.includes(role)) {
    return next(new AppError('Role must be manager or staff', 400));
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

module.exports = { validateRegister, validateLogin };
