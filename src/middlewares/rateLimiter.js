const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

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

// Đăng ký qua email OTP: KHÔNG dùng skipSuccessfulRequests như authLimiter —
// request thành công chính là cái gửi email thật (tốn tiền + hại reputation)
// và cũng là oracle "email này đã có tài khoản chưa".
const registrationOtpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 giờ
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Quá nhiều yêu cầu đăng ký, vui lòng thử lại sau 1 giờ.' },
});

// AI scan: mỗi request gọi Gemini/PaddleOCR (tốn tiền thật + chậm). Chạy TRƯỚC
// body parser nên chỉ có req.user (authenticate ở router staff) — đếm theo staff,
// fallback IP cho request chưa xác thực.
const scanLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    (req.user?._id ? `staff:${req.user._id}` : `ip:${ipKeyGenerator(req.ip)}`),
  message: { success: false, message: 'Quá nhiều lượt quét AI, vui lòng thử lại sau ít phút.' },
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

module.exports = {
  authLimiter,
  passwordResetLimiter,
  smsOtpRequestLimiter,
  registrationOtpLimiter,
  scanLimiter,
  webhookLimiter,
  kioskLimiter,
};
