const crypto = require('node:crypto');
const User = require('../models/user/User');
const OtpVerification = require('../models/user/OtpVerification');
const PhoneOtp = require('../models/user/PhoneOtp');
const AppError = require('../utils/AppError');
const { signToken } = require('../utils/token');
const { ROLES } = require('../constants/roles');
const { sendResetPasswordEmail, sendOtpEmail } = require('../utils/email');
const { sendOtpSms } = require('../utils/sms');

const OTP_TTL_MS = 5 * 60 * 1000; // 5 phút
const OTP_RESEND_COOLDOWN_MS = 60 * 1000; // không gửi lại SMS trong 60s
const MAX_OTP_ATTEMPTS = 5;

const generateNumericOtp = () => String(Math.floor(100000 + Math.random() * 900000));
const hashOtp = (otp) => crypto.createHash('sha256').update(otp).digest('hex');

const toPublicUser = (user) => user.toJSON();

const buildAuthResponse = (user) => ({
  token: signToken(user._id),
  user: toPublicUser(user),
});

// Brute-force lockout: khóa tài khoản sau MAX_FAILED lần sai liên tiếp.
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 5;

const register = async (body) => {
  const { email, password, fullName, phone } = body;

  const exists = await User.exists({ email });
  if (exists) throw new AppError('Email already registered', 409);

  if (phone && (await User.exists({ phone: String(phone).trim() }))) {
    throw new AppError('Số điện thoại đã được đăng ký', 409, 'PHONE_TAKEN');
  }

  const user = await User.create({ email, password, fullName, phone, role: ROLES.USER });

  const fresh = await User.findById(user._id);
  return buildAuthResponse(fresh);
};

const login = async ({ email, password }) => {
  const user = await User.findOne({ email: String(email).trim().toLowerCase() })
    .select('+password +failedLoginAttempts +lockUntil');

  // Generic message để tránh lộ email nào tồn tại.
  if (!user) {
    throw new AppError('Invalid email or password', 401);
  }

  // Đang trong thời gian khóa?
  if (user.lockUntil && user.lockUntil.getTime() > Date.now()) {
    const secs = Math.ceil((user.lockUntil.getTime() - Date.now()) / 1000);
    throw new AppError(
      `Tài khoản tạm khóa do nhập sai quá nhiều lần. Vui lòng thử lại sau ${Math.floor(secs / 60)} phút ${secs % 60} giây.`,
      423,
      'ACCOUNT_LOCKED',
    );
  }

  if (!(await user.comparePassword(password))) {
    user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
    let message = 'Invalid email or password';
    if (user.failedLoginAttempts >= MAX_FAILED_LOGINS) {
      user.lockUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
      user.failedLoginAttempts = 0;
      message = `Sai mật khẩu quá ${MAX_FAILED_LOGINS} lần. Tài khoản bị khóa ${LOCK_MINUTES} phút.`;
    }
    await user.save({ validateModifiedOnly: true });
    throw new AppError(message, 401);
  }

  if (!user.isActive) {
    throw new AppError('Account is deactivated', 403);
  }

  // Đăng nhập thành công → reset bộ đếm + mốc khóa.
  user.failedLoginAttempts = 0;
  user.lockUntil = null;
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

  if (phone && (await User.exists({ phone: String(phone).trim() }))) {
    throw new AppError('Số điện thoại đã được đăng ký', 409, 'PHONE_TAKEN');
  }

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

  if (otpRecord.phone && (await User.exists({ phone: String(otpRecord.phone).trim() }))) {
    throw new AppError('Số điện thoại đã được đăng ký', 409, 'PHONE_TAKEN');
  }

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

const requestPasswordResetSms = async (phone) => {
  const normalizedPhone = String(phone).trim();
  const user = await User.findOne({ phone: normalizedPhone });
  // Luôn resolve bình thường để không lộ số điện thoại có tồn tại tài khoản hay không.
  if (!user || !user.isActive) return;

  const recentOtp = await PhoneOtp.findOne({
    phone: normalizedPhone,
    purpose: 'password_reset',
    consumedAt: null,
    expiresAt: { $gt: new Date(Date.now() + OTP_TTL_MS - OTP_RESEND_COOLDOWN_MS) },
  });
  // OTP gần nhất còn "trẻ" (mới tạo trong vòng 60s) → không gửi SMS lại, tránh spam.
  if (recentOtp) return;

  const otp = generateNumericOtp();

  await PhoneOtp.create({
    phone: normalizedPhone,
    otpHash: hashOtp(otp),
    purpose: 'password_reset',
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
  });

  await sendOtpSms({ phone: normalizedPhone, otp });
};

const resetPasswordSms = async ({ phone, otp, newPassword }) => {
  if (!newPassword || newPassword.length < 6) {
    throw new AppError('Password must be at least 6 characters', 400);
  }

  const normalizedPhone = String(phone).trim();

  const otpRecord = await PhoneOtp.findOne({
    phone: normalizedPhone,
    purpose: 'password_reset',
    consumedAt: null,
    expiresAt: { $gt: new Date() },
  }).sort({ expiresAt: -1 });

  if (!otpRecord) {
    throw new AppError('OTP is invalid or has expired. Please request a new one.', 400);
  }

  if (otpRecord.otpHash !== hashOtp(otp)) {
    otpRecord.attempts += 1;
    if (otpRecord.attempts >= MAX_OTP_ATTEMPTS) {
      // Khoá luôn record này (coi như hết hạn) để chặn brute-force tiếp — user phải request OTP mới.
      otpRecord.expiresAt = new Date();
    }
    await otpRecord.save();
    throw new AppError('OTP is invalid or has expired. Please request a new one.', 400);
  }

  const user = await User.findOne({ phone: normalizedPhone });
  if (!user || !user.isActive) {
    throw new AppError('OTP is invalid or has expired. Please request a new one.', 400);
  }

  user.password = newPassword;
  await user.save({ validateModifiedOnly: true });

  otpRecord.consumedAt = new Date();
  await otpRecord.save();

  return buildAuthResponse(user);
};

module.exports = {
  register,
  login,
  getProfile,
  forgotPassword,
  resetPassword,
  requestRegistration,
  verifyOtpAndRegister,
  requestPasswordResetSms,
  resetPasswordSms,
};

