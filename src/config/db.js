const mongoose = require('mongoose');
const logger = require("../utils/logger");
const env = require('./env');
const dns = require('node:dns');

// Prefer public DNS for the Node process to avoid local resolver SRV refusal.
// 8.8.8.8 / 1.1.1.1 are well-known public resolvers (Google / Cloudflare), not secrets.
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
  logger.info('[MongoDB] dns.setServers ->', dns.getServers());
} catch (e) {
  logger.warn('[MongoDB] dns.setServers failed:', e?.message);
}

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(env.mongodbUri);
    logger.info(`[MongoDB] ${conn.connection.host} / ${conn.connection.name}`);
  } catch (err) {
    logger.error('[MongoDB] connect error:', err);
    throw err;
  }
};

module.exports = connectDB;
