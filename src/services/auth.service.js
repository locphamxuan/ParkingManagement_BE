const crypto = require('crypto');
const User = require('../models/user/User');
const OtpVerification = require('../models/user/OtpVerification');
const AppError = require('../utils/AppError');
const { signToken } = require('../utils/token');
const { ROLES } = require('../constants/roles');
const { sendResetPasswordEmail, sendOtpEmail } = require('../utils/email');

const toPublicUser = (user) => user.toJSON();

const buildAuthResponse = (user) => ({
  token: signToken(user._id),
  user: toPublicUser(user),
});

const register = async (body) => {
  const { email, password, fullName, phone } = body;

  const exists = await User.exists({ email });
  if (exists) throw new AppError('Email already registered', 409);

  const user = await User.create({ email, password, fullName, phone, role: ROLES.USER });

  const fresh = await User.findById(user._id);
  return buildAuthResponse(fresh);
};

const login = async ({ email, password }) => {
  const user = await User.findOne({ email: String(email).trim().toLowerCase() }).select('+password');

  if (!user || !(await user.comparePassword(password))) {
    throw new AppError('Invalid email or password', 401);
  }
  if (!user.isActive) {
    throw new AppError('Account is deactivated', 403);
  }

  user.lastLoginAt = new Date();
  await user.save({ validateModifiedOnly: true });

  return buildAuthResponse(user);
};

const getProfile = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found', 404);
  return toPublicUser(user);
};

const forgotPassword = async (email, frontendUrlFromRequest, clientType) => {
  const user = await User.findOne({ email: email.trim().toLowerCase() });
  // Always respond the same to prevent email enumeration
  if (!user || !user.isActive) return;

  const plainToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(plainToken).digest('hex');

  user.resetPasswordToken = hashedToken;
  user.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 min
  await user.save({ validateModifiedOnly: true });

  let resetUrl;
  if (clientType === 'mobile') {
    resetUrl = `pbms://reset-password?token=${plainToken}`;
  } else {
    const frontendUrl = frontendUrlFromRequest || process.env.FRONTEND_URL || 'http://localhost:5173';
    resetUrl = `${frontendUrl}/auth/reset-password?token=${plainToken}`;
  }

  await sendResetPasswordEmail({ to: user.email, resetUrl, fullName: user.fullName });
};

const resetPassword = async (token, newPassword) => {
  if (!token) throw new AppError('Token is required', 400);
  if (!newPassword || newPassword.length < 6) {
    throw new AppError('Password must be at least 6 characters', 400);
  }

  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  const user = await User.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpires: { $gt: new Date() },
  }).select('+resetPasswordToken +resetPasswordExpires');

  if (!user) throw new AppError('Reset token is invalid or has expired', 400);

  user.password = newPassword;
  user.resetPasswordToken = null;
  user.resetPasswordExpires = null;
  await user.save({ validateModifiedOnly: true });

  return buildAuthResponse(user);
};

const requestRegistration = async (body) => {
  const { email, password, fullName, phone } = body;

  const emailExists = await User.exists({ email });
  if (emailExists) throw new AppError('Email already registered', 409);

  const otp = String(Math.floor(100000 + Math.random() * 900000));

  await OtpVerification.deleteOne({ email });
  await OtpVerification.create({ email, otp, password, fullName, phone });

  await sendOtpEmail({ to: email, otp, fullName });
};

const verifyOtpAndRegister = async ({ email, otp }) => {
  const otpRecord = await OtpVerification.findOne({ email });

  if (!otpRecord) {
    throw new AppError('OTP has expired or does not exist. Please request a new one.', 400);
  }
  if (otpRecord.otp !== otp) {
    throw new AppError('Invalid OTP code', 400);
  }

  const emailExists = await User.exists({ email });
  if (emailExists) throw new AppError('Email already registered', 409);

  const user = await User.create({
    email: otpRecord.email,
    password: otpRecord.password,
    fullName: otpRecord.fullName,
    phone: otpRecord.phone,
    role: ROLES.USER,
  });

  await OtpVerification.deleteOne({ email });

  const fresh = await User.findById(user._id);
  return buildAuthResponse(fresh);
};

module.exports = { register, login, getProfile, forgotPassword, resetPassword, requestRegistration, verifyOtpAndRegister };

