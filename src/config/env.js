require('dotenv').config();

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
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
};

const required = ['mongodbUri', 'jwtSecret', 'payosClientId', 'payosApiKey', 'payosChecksumKey'];
const missing = required.filter((key) => !env[key]);

if (missing.length) {
  throw new Error(
    `Missing env: ${missing.join(', ')}. Copy .env.example to .env and fill in the values.`
  );
}

module.exports = env;
