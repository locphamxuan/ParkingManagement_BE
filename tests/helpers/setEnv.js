/**
 * Đặt biến môi trường BẮT BUỘC trước khi bất kỳ module nào (config/env, token,
 * payos.service) được require. config/env sẽ throw nếu thiếu các key này.
 * Chạy qua jest `setupFiles` (trước khi test file được load).
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pbms-test';
process.env.PAYOS_CLIENT_ID = process.env.PAYOS_CLIENT_ID || 'test-client-id';
process.env.PAYOS_API_KEY = process.env.PAYOS_API_KEY || 'test-api-key';
process.env.PAYOS_CHECKSUM_KEY = process.env.PAYOS_CHECKSUM_KEY || 'test-checksum-key';
process.env.CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
process.env.KIOSK_DEVICE_TOKEN = process.env.KIOSK_DEVICE_TOKEN || 'test-kiosk-device-token';

// OCR nhận diện biển số: ghim RỖNG để test không bao giờ phụ thuộc .env của máy
// dev (dotenv không ghi đè key đã tồn tại, kể cả khi giá trị là ''). Test nào cần
// một provider cụ thể thì tự set env.ocrProvider / paddleOcrUrl / geminiApiKey.
process.env.OCR_PROVIDER = '';
process.env.GEMINI_API_KEY = '';
process.env.PADDLE_OCR_URL = '';
