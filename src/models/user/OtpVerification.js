const mongoose = require('mongoose');

/**
 * Pending email-registration OTP.
 *
 * Deliberately holds NO password: the password is sent only in the final
 * (already OTP-verified) register-verify request and goes straight to
 * User.create() for bcrypt hashing. It also holds no plaintext OTP — only a
 * SHA-256 hash, compared in constant time by auth.service.
 */
const MAX_OTP_ATTEMPTS = 5;

const otpVerificationSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    lowercase: true,
    trim: true,
    // One pending registration per email — a resend replaces the previous row
    // instead of racing it.
    unique: true,
  },
  otpHash: {
    type: String,
    required: [true, 'OTP hash is required'],
  },
  attempts: {
    type: Number,
    default: 0,
  },
  fullName: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true,
  },
  phone: {
    type: String,
    trim: true,
    default: null,
  },
  expiresAt: {
    type: Date,
    required: true,
    // TTL index: Mongo removes the document once expiresAt passes.
    expires: 0,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const OtpVerification = mongoose.model('OtpVerification', otpVerificationSchema);

module.exports = OtpVerification;
module.exports.MAX_OTP_ATTEMPTS = MAX_OTP_ATTEMPTS;
