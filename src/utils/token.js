const jwt = require('jsonwebtoken');
const env = require('../config/env');
const AppError = require('./AppError');
const logger = require('./logger');

const signToken = (userId) =>
  jwt.sign({ id: userId }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });

// Cookie `maxAge` (ms) matching env.jwtExpiresIn ('7d', '12h', ...) so the
// auth cookie expires alongside the JWT it carries. Defaults to 7 days if
// the format isn't a plain "<number><unit>" string.
const cookieMaxAgeMs = () => {
  const match = /^(\d+)([smhd])$/.exec(String(env.jwtExpiresIn).trim());
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const value = Number(match[1]);
  const unitMs = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2]];
  return value * unitMs;
};

const verifyToken = (token) => {
  try {
    return jwt.verify(token, env.jwtSecret);
  } catch (error) {
    logger.warn('Token verification failed:', error.name, error.message);
    throw new AppError('Invalid or expired token', 401);
  }
};

module.exports = { signToken, verifyToken, cookieMaxAgeMs };
