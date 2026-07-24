const express = require('express');
const authController = require('../../controllers/auth.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { authLimiter, passwordResetLimiter } = require('../../middlewares/rateLimiter');
const {
  validateRegister,
  validateLogin,
  validateForgotPassword,
  validateResetPassword,
  validateRegisterRequest,
  validateRegisterVerify,
} = require('../../validators/auth.validator');

const router = express.Router();

router.post('/register', authLimiter, validateRegister, authController.register);
router.post('/register-request', authLimiter, validateRegisterRequest, authController.registerRequest);
router.post('/register-verify', authLimiter, validateRegisterVerify, authController.registerVerify);
router.post('/login', authLimiter, validateLogin, authController.login);
router.post('/logout', authController.logout);
router.get('/me', authenticate, authController.getMe);
router.post('/forgot-password', passwordResetLimiter, validateForgotPassword, authController.forgotPassword);
router.post('/reset-password', passwordResetLimiter, validateResetPassword, authController.resetPassword);

module.exports = router;
