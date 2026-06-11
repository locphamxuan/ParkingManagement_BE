const jwt = require('jsonwebtoken');
const env = require('../config/env');
const AppError = require('./AppError');

const signToken = (userId) =>
  jwt.sign({ id: userId }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });

const verifyToken = (token) => {
  try {
    return jwt.verify(token, env.jwtSecret);
  } catch (error) {
    // Log the actual JWT error for debugging
    console.error('Token verification failed:', {
      error: error.message,
      name: error.name,
      expiredAt: error.expiredAt,
      token: token.substring(0, 20) + '...' // Log partial token for debugging
    });
    throw new AppError('Invalid or expired token', 401);
  }
};

module.exports = { signToken, verifyToken };
