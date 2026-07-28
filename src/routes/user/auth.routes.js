const express = require('express');
const authController = require('../../controllers/auth.controller');
const AppError = require('../../utils/AppError');
const { authenticate } = require('../../middlewares/auth.middleware');
const { clearAuthCookie } = require('../../utils/authCookie');
const {
  authLimiter,
  passwordResetLimiter,
  smsOtpRequestLimiter,
  registrationOtpLimiter,
} = require('../../middlewares/rateLimiter');
const {
  validateLogin,
  validateForgotPassword,
  validateResetPassword,
  validateRegisterRequest,
  validateRegisterVerify,
  validateForgotPasswordSms,
  validateResetPasswordSms,
} = require('../../validators/auth.validator');

const router = express.Router();

// Removed: direct registration bypassed email OTP verification entirely, which
// allowed accounts on addresses the registrant did not control. 410 (not 404)
// so an un-updated client gets a diagnosable answer instead of a routing error.
router.post('/register', (_req, _res, next) =>
  next(new AppError(
    'Direct registration has been removed. Use POST /api/users/auth/register-request then /register-verify.',
    410,
    'REGISTRATION_ENDPOINT_REMOVED',
  )));

router.post('/register-request', registrationOtpLimiter, validateRegisterRequest, authController.registerRequest);
router.post('/register-verify', authLimiter, validateRegisterVerify, authController.registerVerify);
router.post('/login', authLimiter, validateLogin, authController.login);

// Clear the cookie even when the session is already invalid, so a browser
// holding a revoked/expired cookie is never stuck unable to log out.
const clearCookieOnAuthFailure = (err, _req, res, next) => {
  clearAuthCookie(res);
  next(err);
};
router.post('/logout', authenticate, clearCookieOnAuthFailure, authController.logout);

router.get('/me', authenticate, authController.getMe);
router.post('/forgot-password', passwordResetLimiter, validateForgotPassword, authController.forgotPassword);
router.post('/reset-password', passwordResetLimiter, validateResetPassword, authController.resetPassword);
router.post('/forgot-password-sms', smsOtpRequestLimiter, validateForgotPasswordSms, authController.forgotPasswordSms);
router.post('/reset-password-sms', passwordResetLimiter, validateResetPasswordSms, authController.resetPasswordSms);

module.exports = router;
