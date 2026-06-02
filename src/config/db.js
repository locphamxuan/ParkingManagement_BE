const mongoose = require('mongoose');
const env = require('./env');
const dns = require('dns');

// Prefer public DNS for the Node process to avoid local resolver SRV refusal
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
  console.log('[MongoDB] dns.setServers ->', dns.getServers());
} catch (e) {
  console.warn('[MongoDB] dns.setServers failed:', e && e.message);
}

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(env.mongodbUri);
    console.log(`[MongoDB] ${conn.connection.host} / ${conn.connection.name}`);
  } catch (err) {
    console.error('[MongoDB] connect error:', err);
    throw err;
  }
};

module.exports = connectDB;
