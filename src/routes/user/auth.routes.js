const express = require('express');
const authController = require('../../controllers/auth.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const {
  validateRegister,
  validateLogin,
  validateForgotPassword,
  validateResetPassword,
  validateRegisterRequest,
  validateRegisterVerify,
} = require('../../validators/auth.validator');

const router = express.Router();

router.post('/register', validateRegister, authController.register);
router.post('/register-request', validateRegisterRequest, authController.registerRequest);
router.post('/register-verify', validateRegisterVerify, authController.registerVerify);
router.post('/login', validateLogin, authController.login);
router.get('/me', authenticate, authController.getMe);
router.post('/forgot-password', validateForgotPassword, authController.forgotPassword);
router.post('/reset-password', validateResetPassword, authController.resetPassword);

module.exports = router;
