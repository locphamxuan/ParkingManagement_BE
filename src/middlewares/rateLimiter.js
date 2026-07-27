const rateLimit = require('express-rate-limit');

// Auth endpoints: login, register, forgot/reset password
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Quá nhiều yêu cầu, vui lòng thử lại sau 15 phút.' },
  skipSuccessfulRequests: true, // chỉ đếm request thất bại
});

// Forgot/reset password: nghiêm hơn để chống spam email
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 giờ
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Quá nhiều yêu cầu đặt lại mật khẩu, vui lòng thử lại sau 1 giờ.' },
});

// Forgot password qua SMS: SMS tốn phí thật (eSMS.vn) → giới hạn chặt hơn cả email.
const smsOtpRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Quá nhiều yêu cầu gửi OTP, vui lòng thử lại sau 15 phút.' },
});

// PayOS webhook: PayOS có thể gửi nhiều event/phút (retry), nhưng cần chặn flood từ bên ngoài.
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 phút
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Quá nhiều webhook request.' },
});

const kioskLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many kiosk check-in requests.' },
});

module.exports = { authLimiter, passwordResetLimiter, smsOtpRequestLimiter, webhookLimiter, kioskLimiter };
