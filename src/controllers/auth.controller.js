const authService = require('../services/auth.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { setAuthCookie, clearAuthCookie } = require('../utils/authCookie');

const register = asyncHandler(async (req, res) => {
  const data = await authService.register(req.body);
  setAuthCookie(res, data.token);
  sendSuccess(res, {
    statusCode: 201,
    message: 'Registration successful',
    data,
  });
});

const login = asyncHandler(async (req, res) => {
  const data = await authService.login(req.body);
  setAuthCookie(res, data.token);
  sendSuccess(res, { message: 'Login successful', data });
});

const logout = asyncHandler(async (_req, res) => {
  clearAuthCookie(res);
  sendSuccess(res, { message: 'Logged out successfully' });
});

const getMe = asyncHandler(async (req, res) => {
  const user = await authService.getProfile(req.user.id);
  sendSuccess(res, { data: { user } });
});

const forgotPassword = asyncHandler(async (req, res) => {
  await authService.forgotPassword(req.body.email, req.body.frontendUrl, req.body.clientType);
  // Always return 200 regardless of whether email exists (prevent enumeration)
  sendSuccess(res, {
    message: 'If that email is registered, a reset link has been sent.',
  });
});

const resetPassword = asyncHandler(async (req, res) => {
  const data = await authService.resetPassword(req.body.token, req.body.newPassword);
  sendSuccess(res, { message: 'Password has been reset successfully', data });
});

const registerRequest = asyncHandler(async (req, res) => {
  await authService.requestRegistration(req.body);
  sendSuccess(res, {
    message: 'OTP has been sent to your email. Please verify to complete registration.',
  });
});

const registerVerify = asyncHandler(async (req, res) => {
  const data = await authService.verifyOtpAndRegister(req.body);
  setAuthCookie(res, data.token);
  sendSuccess(res, {
    statusCode: 201,
    message: 'Registration successful',
    data,
  });
});

const forgotPasswordSms = asyncHandler(async (req, res) => {
  await authService.requestPasswordResetSms(req.body.phone);
  // Always return 200 regardless of whether phone exists (prevent enumeration)
  sendSuccess(res, {
    message: 'If that phone number is registered, an OTP has been sent.',
  });
});

const resetPasswordSms = asyncHandler(async (req, res) => {
  const data = await authService.resetPasswordSms(req.body);
  sendSuccess(res, { message: 'Password has been reset successfully', data });
});

module.exports = {
  register,
  login,
  logout,
  getMe,
  forgotPassword,
  resetPassword,
  registerRequest,
  registerVerify,
  forgotPasswordSms,
  resetPasswordSms,
};
