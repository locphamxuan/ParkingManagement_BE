const app = require('./app');
const logger = require('./utils/logger');
const connectDB = require('./config/db');
const env = require('./config/env');
const { findAvailablePort } = require('./utils/findPort');

let server;

const listen = (port) =>
  new Promise((resolve, reject) => {
    const instance = app.listen(port);

    instance.once('listening', () => resolve(instance));
    instance.once('error', reject);
  });

const shutdown = async (signal) => {
  logger.info(`\n[Server] ${signal} — đang tắt...`);

  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }

  const mongoose = require('mongoose');
  await mongoose.connection.close();

  process.exit(0);
};

const start = async () => {
  await connectDB();

  // Scheduler: nhắc gói sắp hết hạn (7/5/3/1 ngày), đánh dấu hết hạn và thu hồi slot grace.
  require('./jobs/subscriptionExpiry.job').start();
  // Scheduler: tự động hết hạn reservation no-show (quá 30 phút) và thả slot.
  require('./jobs/reservationExpiry.job').start();

  const port = await findAvailablePort(env.port);

  if (port !== env.port) {
    logger.warn(
      `[Server] Port ${env.port} đang dùng → chuyển sang port ${port} (không cần kill thủ công)`
    );
  }

  server = await listen(port);
  logger.info(`[Server] Server đã chạy thành công — http://localhost:${port}`);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start().catch((err) => {
  logger.error('[Server] Unhandled error during start:', err);
  process.exit(1);
});
