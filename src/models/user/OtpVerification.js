const mongoose = require('mongoose');

const otpVerificationSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    lowercase: true,
    trim: true,
  },
  otp: {
    type: String,
    required: [true, 'OTP is required'],
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
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
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 300,
  },
});

const OtpVerification = mongoose.model('OtpVerification', otpVerificationSchema);

module.exports = OtpVerification;
