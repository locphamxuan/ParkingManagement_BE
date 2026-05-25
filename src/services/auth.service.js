const crypto = require('crypto');
const User = require('../models/user/User');
const AppError = require('../utils/AppError');
const { signToken } = require('../utils/token');
const { ROLES } = require('../constants/roles');
const { sendResetPasswordEmail } = require('../utils/email');

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
  const user = await User.findOne({ email }).select('+password');

  if (!user || !(await user.comparePassword(password))) {
    throw new AppError('Invalid email or password', 401);
  }
  if (!user.isActive) {
    throw new AppError('Account is deactivated', 403);
  }

  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  return buildAuthResponse(user);
};

const getProfile = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found', 404);
  return toPublicUser(user);
};

const forgotPassword = async (email) => {
  const user = await User.findOne({ email: email.trim().toLowerCase() });
  // Always respond the same to prevent email enumeration
  if (!user || !user.isActive) return;

  const plainToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(plainToken).digest('hex');

  user.resetPasswordToken = hashedToken;
  user.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 min
  await user.save({ validateBeforeSave: false });

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const resetUrl = `${frontendUrl}/auth/reset-password?token=${plainToken}`;

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
  await user.save();

  return buildAuthResponse(user);
};

module.exports = { register, login, getProfile, forgotPassword, resetPassword };

