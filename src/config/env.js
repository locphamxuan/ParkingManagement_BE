require('dotenv').config();

// Mọi khái niệm "hôm nay" trong hệ thống (doanh thu hôm nay, trần phí theo ngày,
// ca làm việc) là ngày theo giờ Việt Nam, không phải giờ của máy chủ. Host miễn phí
// (Render/Fly) chạy UTC, nên nếu không ghim TZ thì 00:00–07:00 giờ VN bị tính sang
// ngày hôm trước và card "Revenue Today" hiện 0 dù đã có giao dịch.
// Gán vào process.env.TZ ngay tại đây — trước khi bất kỳ Date nào được tạo — để mọi
// setHours()/getTimezoneOffset() trong codebase dùng chung một múi giờ nghiệp vụ.
process.env.TZ = process.env.APP_TIMEZONE || 'Asia/Ho_Chi_Minh';

const clientOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5000,
  mongodbUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  // PayOS — https://my.payos.vn/developers
  payosClientId: process.env.PAYOS_CLIENT_ID,
  payosApiKey: process.env.PAYOS_API_KEY,
  payosChecksumKey: process.env.PAYOS_CHECKSUM_KEY,
  clientOrigins,
  // Canonical public web URL for payment redirects and reset links.
  frontendUrl: (process.env.FRONTEND_URL || clientOrigins[0]).replace(/\/+$/, ''),
  // Google Gemini — AI camera plate/brand recognition (free tier).
  // Optional: the app boots without it; the /scan endpoint returns 503 if unset.
  geminiApiKey: process.env.GEMINI_API_KEY || null,
  // OCR provider cho camera cổng: "gemini" | "paddle". Bỏ trống → tự chọn
  // theo cấu hình sẵn có (paddle > gemini). Không cấu hình gì → lỗi 503, không mock.
  ocrProvider: process.env.OCR_PROVIDER || null,
  // Base URL của PaddleOCR microservice (ocr-service/), vd http://localhost:8868
  paddleOcrUrl: process.env.PADDLE_OCR_URL || null,
  // Hạn chờ PaddleOCR. 15s là đủ cho service chạy sẵn cùng mạng nội bộ, nhưng một
  // service host miễn phí ngủ đông phải nạp lại model OCR khi tỉnh dậy và có thể
  // mất lâu hơn thế — nới biến này thay vì sửa code khi gặp trường hợp đó.
  paddleOcrTimeoutMs: Number(process.env.PADDLE_OCR_TIMEOUT_MS) || 15000,
  // eSMS.vn — gửi OTP SMS cho luồng quên mật khẩu qua điện thoại (Mobile).
  // Optional: app vẫn khởi động không có key; chỉ throw lúc thực sự gửi SMS (utils/sms.js).
  esmsApiKey: process.env.ESMS_API_KEY || null,
  esmsSecretKey: process.env.ESMS_SECRET_KEY || null,
  esmsBrandname: process.env.ESMS_BRANDNAME || null,
  // Secret provisioned on each managed gate kiosk. It is deliberately not a
  // browser-visible value; a kiosk without it cannot create parking sessions.
  kioskDeviceToken: process.env.KIOSK_DEVICE_TOKEN || null,
  // Số ngày hiệu lực của mã QR phương tiện. QR là tài sản của CHỦ XE và dùng được
  // ở mọi tòa nhà, nên hạn dùng phải là một con số duy nhất của hệ thống — nếu để
  // từng tòa tự đặt thì một chiếc xe đi 3 tòa sẽ có 3 hạn mâu thuẫn nhau.
  // Hết hạn thì QR tự được cấp lại khi chủ xe mở mã (xem services/user/vehicleQr).
  vehicleQrTtlDays: Number(process.env.VEHICLE_QR_TTL_DAYS) || 2,
  // Múi giờ nghiệp vụ đã ghim vào process.env.TZ ở đầu file; giữ lại để log/debug.
  timezone: process.env.TZ,
};

const required = ['mongodbUri', 'jwtSecret', 'payosClientId', 'payosApiKey', 'payosChecksumKey'];
const missing = required.filter((key) => !env[key]);

if (missing.length) {
  throw new Error(
    `Missing env: ${missing.join(', ')}. Copy .env.example to .env and fill in the values.`
  );
}

if (env.nodeEnv === 'production') {
  if (env.jwtSecret.length < 32 || /your_|change.*production|replace_with/i.test(env.jwtSecret)) {
    throw new Error('JWT_SECRET must be a random production secret of at least 32 characters.');
  }
  const insecurePublicUrls = [...env.clientOrigins, env.frontendUrl]
    .filter((value) => !value.startsWith('https://'));
  if (insecurePublicUrls.length) {
    throw new Error('CLIENT_URL and FRONTEND_URL must use HTTPS in production.');
  }
}

module.exports = env;
