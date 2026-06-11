/**
 * logger.js — logger tối giản, tập trung cho toàn BE (thay cho console.* rải rác).
 * Có timestamp + level; dễ thay bằng pino/winston sau này mà không phải sửa nơi gọi.
 */
const ts = () => new Date().toISOString();

const logger = {
  info: (...args) => console.log(`[${ts()}] [INFO]`, ...args),
  warn: (...args) => console.warn(`[${ts()}] [WARN]`, ...args),
  error: (...args) => console.error(`[${ts()}] [ERROR]`, ...args),
};

module.exports = logger;
