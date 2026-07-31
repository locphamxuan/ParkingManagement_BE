const jwt = require('jsonwebtoken');
const env = require('../config/env');
const AppError = require('./AppError');
const logger = require('./logger');

/**
 * Takes the whole user document (not just an id) so the caller cannot forget
 * to stamp the token version — auth.middleware rejects any token without a
 * `tv` claim matching User.tokenVersion.
 */
const signToken = (user) => {
  if (!user?._id) {
    throw new AppError('Cannot sign a token without a user', 500);
  }
  return jwt.sign(
    { id: user._id, tv: user.tokenVersion || 0 },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn },
  );
};

const verifyToken = (token) => {
  try {
    return jwt.verify(token, env.jwtSecret);
  } catch (error) {
    logger.warn('Token verification failed:', error.name, error.message);
    throw new AppError('Invalid or expired token', 401);
  }
};

module.exports = { signToken, verifyToken };
