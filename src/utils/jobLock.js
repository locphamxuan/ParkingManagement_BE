const mongoose = require('mongoose');
const logger = require('./logger');

const COL = 'job_locks';
const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 phút — đủ cho bất kỳ job nào

let indexed = false;

const ensureIndex = async () => {
  if (indexed) return;
  const col = mongoose.connection.db.collection(COL);
  await col.createIndex({ jobName: 1 }, { unique: true });
  await col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  indexed = true;
};

/**
 * Thử giành lock cho `jobName`. Trả về true nếu giành được, false nếu đã bị
 * instance khác giữ. Lock tự hủy sau `ttlMs` ms (TTL index + MongoDB TTL).
 */
const acquireLock = async (jobName, ttlMs = DEFAULT_TTL_MS) => {
  try {
    await ensureIndex();
    const now = new Date();
    const col = mongoose.connection.db.collection(COL);
    // Xóa lock hết hạn trước để tránh unique-key conflict trên lock cũ
    await col.deleteMany({ jobName, expiresAt: { $lt: now } });
    // insertOne fail với code 11000 nếu instance khác vừa insert cùng jobName
    await col.insertOne({ jobName, acquiredAt: now, expiresAt: new Date(now.getTime() + ttlMs) });
    return true;
  } catch (err) {
    if (err?.code === 11000) return false;
    logger.error('[jobLock] acquireLock error:', err.message);
    return false;
  }
};

/**
 * Giải phóng lock ngay khi job xong (không đợi TTL tự hết hạn).
 */
const releaseLock = async (jobName) => {
  try {
    const col = mongoose.connection.db.collection(COL);
    await col.deleteOne({ jobName });
  } catch (err) {
    logger.error('[jobLock] releaseLock error:', err.message);
  }
};

module.exports = { acquireLock, releaseLock };
