const crypto = require('node:crypto');
const User = require('../models/user/User');
const OtpVerification = require('../models/user/OtpVerification');
const PhoneOtp = require('../models/user/PhoneOtp');
const AppError = require('../utils/AppError');
const { signToken } = require('../utils/token');
const { assertStrongPassword } = require('../utils/passwordPolicy');
const { ROLES } = require('../constants/roles');
const { sendResetPasswordEmail, sendOtpEmail } = require('../utils/email');
const { sendOtpSms } = require('../utils/sms');
const env = require('../config/env');

const OTP_TTL_MS = 5 * 60 * 1000; // 5 phút
const OTP_RESEND_COOLDOWN_MS = 60 * 1000; // không gửi lại SMS trong 60s
const MAX_OTP_ATTEMPTS = 5;

const generateNumericOtp = () => String(crypto.randomInt(100000, 1000000));
const hashOtp = (otp) => crypto.createHash('sha256').update(String(otp)).digest('hex');

// Both sides are fixed-length sha256 hex, so this never throws on length.
const otpHashMatches = (candidateHash, storedHash) =>
  candidateHash.length === storedHash.length &&
  crypto.timingSafeEqual(Buffer.from(candidateHash), Buffer.from(storedHash));

const toPublicUser = (user) => user.toJSON();

const buildAuthResponse = (user) => ({
  token: signToken(user),
  user: toPublicUser(user),
});

// Invalidates every JWT already issued for this account. The caller is
// responsible for persisting the user afterwards.
const bumpTokenVersion = (user) => {
  user.tokenVersion = (user.tokenVersion || 0) + 1;
};

// Brute-force lockout: khóa tài khoản sau MAX_FAILED lần sai liên tiếp.
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 5;

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

const forgotPassword = async (email, clientType) => {
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
    resetUrl = `${env.frontendUrl}/auth/reset-password?token=${plainToken}`;
  }

  await sendResetPasswordEmail({ to: user.email, resetUrl, fullName: user.fullName });
};

const resetPassword = async (token, newPassword) => {
  if (!token) throw new AppError('Token is required', 400);
  assertStrongPassword(newPassword);

  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  const user = await User.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpires: { $gt: new Date() },
  }).select('+resetPasswordToken +resetPasswordExpires');

  if (!user) throw new AppError('Reset token is invalid or has expired', 400);

  user.password = newPassword;
  user.resetPasswordToken = null;
  user.resetPasswordExpires = null;
  bumpTokenVersion(user);
  await user.save({ validateModifiedOnly: true });

  return buildAuthResponse(user);
};

/**
 * Step 1 — send the OTP. Stores only the OTP hash plus non-secret registration
 * metadata; the password is NOT accepted here and never touches the database
 * before bcrypt. A resend replaces the previous record (new hash, attempts
 * reset), so the old code stops working immediately.
 *
 * Resolves silently — and identically — when the email is already registered or
 * the phone belongs to someone else. Returning 409 here told an unauthenticated
 * caller exactly which addresses have accounts. The controller sends the same
 * generic message either way, and the duplicate checks in verifyOtpAndRegister
 * remain as the real (race-safe) guard.
 */
const requestRegistration = async (body) => {
  const { email, fullName, phone } = body;

  const emailExists = await User.exists({ email });
  if (emailExists) return;

  if (phone && (await User.exists({ phone: String(phone).trim() }))) return;

  const otp = generateNumericOtp();

  await OtpVerification.findOneAndUpdate(
    { email },
    {
      email,
      otpHash: hashOtp(otp),
      attempts: 0,
      fullName,
      phone: phone || null,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
      createdAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  await sendOtpEmail({ to: email, otp, fullName });
};

/**
 * Step 2 — verify the OTP and create the account. The password arrives here for
 * the first time, over HTTPS, and goes straight into User.create() (the schema
 * pre-save hook bcrypts it). It is never written anywhere else.
 */
const verifyOtpAndRegister = async ({ email, otp, password }) => {
  assertStrongPassword(password);

  const otpRecord = await OtpVerification.findOne({ email, expiresAt: { $gt: new Date() } });
  const expiredMessage = 'OTP has expired or does not exist. Please request a new one.';

  if (!otpRecord) throw new AppError(expiredMessage, 400);

  if (!otpHashMatches(hashOtp(otp), otpRecord.otpHash)) {
    otpRecord.attempts += 1;
    if (otpRecord.attempts >= MAX_OTP_ATTEMPTS) {
      // Burn the record so brute-forcing costs a fresh emailed OTP each time.
      await OtpVerification.deleteOne({ _id: otpRecord._id });
      throw new AppError(
        'Too many incorrect codes. Please request a new one.',
        400,
        'OTP_ATTEMPTS_EXCEEDED',
      );
    }
    await otpRecord.save();
    throw new AppError('Invalid OTP code', 400);
  }

  const emailExists = await User.exists({ email });
  if (emailExists) throw new AppError('Email already registered', 409);

  if (otpRecord.phone && (await User.exists({ phone: String(otpRecord.phone).trim() }))) {
    throw new AppError('Số điện thoại đã được đăng ký', 409, 'PHONE_TAKEN');
  }

  const user = await User.create({
    email: otpRecord.email,
    password,
    fullName: otpRecord.fullName,
    phone: otpRecord.phone,
    role: ROLES.USER,
  });

  await OtpVerification.deleteOne({ _id: otpRecord._id });

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
  assertStrongPassword(newPassword);

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
  bumpTokenVersion(user);
  await user.save({ validateModifiedOnly: true });

  otpRecord.consumedAt = new Date();
  await otpRecord.save();

  return buildAuthResponse(user);
};

/** Logout — revoke every JWT issued for this account. */
const revokeSessions = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found', 404);
  bumpTokenVersion(user);
  await user.save({ validateModifiedOnly: true });
};

module.exports = {
  login,
  getProfile,
  forgotPassword,
  resetPassword,
  requestRegistration,
  verifyOtpAndRegister,
  requestPasswordResetSms,
  resetPasswordSms,
  revokeSessions,
};

