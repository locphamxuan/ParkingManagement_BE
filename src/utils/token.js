const jwt = require('jsonwebtoken');
const env = require('../config/env');
const AppError = require('./AppError');
const logger = require('./logger');

const signToken = (userId) =>
  jwt.sign({ id: userId }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });

const verifyToken = (token) => {
  try {
    return jwt.verify(token, env.jwtSecret);
  } catch (error) {
    logger.warn('Token verification failed:', error.name, error.message);
    throw new AppError('Invalid or expired token', 401);
  }
};

module.exports = { signToken, verifyToken };
