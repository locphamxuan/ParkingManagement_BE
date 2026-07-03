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
