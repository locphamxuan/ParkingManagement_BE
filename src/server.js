const app = require('./app');
const connectDB = require('./config/db');
const env = require('./config/env');
const { findAvailablePort } = require('./utils/findPort');
const revenueSettlementJob = require('./jobs/revenueSettlement.job');

let server;

const listen = (port) =>
  new Promise((resolve, reject) => {
    const instance = app.listen(port);

    instance.once('listening', () => resolve(instance));
    instance.once('error', reject);
  });

const shutdown = async (signal) => {
  console.log(`\n[Server] ${signal} — đang tắt...`);

  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }

  const mongoose = require('mongoose');
  await mongoose.connection.close();

  process.exit(0);
};

const start = async () => {
  await connectDB();

  const port = await findAvailablePort(env.port);

  if (port !== env.port) {
    console.warn(
      `[Server] Port ${env.port} đang dùng → chuyển sang port ${port} (không cần kill thủ công)`
    );
  }

  server = await listen(port);
  console.log(`[Server] Server đã chạy thành công — http://localhost:${port}`);

  // Auto-settle 30% doanh thu ngày của manager → ví admin (catch-up + hourly)
  revenueSettlementJob.start();
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start().catch((err) => {
  console.error('[Server] Unhandled error during start:', err);
  process.exit(1);
});
