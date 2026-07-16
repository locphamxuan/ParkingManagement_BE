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
  logger.info(`\n[Server] ${signal} received — shutting down gracefully...`);

  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }

  const mongoose = require('mongoose');
  await mongoose.connection.close();

  process.exit(0);
};

const start = async () => {
  // Establish database connection
  await connectDB();

  // Cron Schedulers
  // 1. Subscription Expiry Job: Reminds users of upcoming expiry (7/5/3/1 days), marks expired, and releases grace slots.
  require('./jobs/subscriptionExpiry.job').start();

  // Resolve active port dynamically
  const port = await findAvailablePort(env.port);

  if (port !== env.port) {
    logger.warn(
      `[Server] Configured port ${env.port} is already in use ➔ Dynamically switching to port ${port}`
    );
  }

  // Start Express HTTP Server
  server = await listen(port);
  
  // Terminal Status Logs
  logger.info(`[Server] Application is successfully running at ➔ http://localhost:${port}`);
  logger.info(`[Swagger] API Documentation UI available at     ➔ http://localhost:${port}/api-docs`);
};

// Intercept system termination signals
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Execute bootstrapping logic
start().catch((err) => {
  logger.error('[Server] Unhandled critical error during bootstrap:', err);
  process.exit(1);
});