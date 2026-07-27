const mongoose = require('mongoose');

// OTP gửi SMS cho quên mật khẩu qua điện thoại — tách riêng khỏi OtpVerification
// (model đó lưu payload đăng ký tạm thời, khoá theo email, không phù hợp reset password
// cho user đã tồn tại). OTP lưu dạng hash (không plaintext) để giảm rủi ro khi DB lộ.
const phoneOtpSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: [true, 'Phone is required'],
    trim: true,
    index: true,
  },
  otpHash: {
    type: String,
    required: [true, 'otpHash is required'],
  },
  purpose: {
    type: String,
    enum: ['password_reset'],
    default: 'password_reset',
    required: true,
  },
  attempts: {
    type: Number,
    default: 0,
  },
  consumedAt: {
    type: Date,
    default: null,
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: 0 },
  },
});

const PhoneOtp = mongoose.model('PhoneOtp', phoneOtpSchema);

module.exports = PhoneOtp;
