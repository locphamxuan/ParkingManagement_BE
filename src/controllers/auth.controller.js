const authService = require('../services/auth.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');

const register = asyncHandler(async (req, res) => {
  const data = await authService.register(req.body);
  sendSuccess(res, {
    statusCode: 201,
    message: 'Registration successful',
    data,
  });
});

const login = asyncHandler(async (req, res) => {
  const data = await authService.login(req.body);
  sendSuccess(res, { message: 'Login successful', data });
});

const getMe = asyncHandler(async (req, res) => {
  const user = await authService.getProfile(req.user.id);
  sendSuccess(res, { data: { user } });
});

const forgotPassword = asyncHandler(async (req, res) => {
  await authService.forgotPassword(req.body.email);
  // Always return 200 regardless of whether email exists (prevent enumeration)
  sendSuccess(res, {
    message: 'If that email is registered, a reset link has been sent.',
  });
});

const resetPassword = asyncHandler(async (req, res) => {
  const data = await authService.resetPassword(req.body.token, req.body.newPassword);
  sendSuccess(res, { message: 'Password has been reset successfully', data });
});

module.exports = { register, login, getMe, forgotPassword, resetPassword };
