const authService = require('../services/auth.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { setAuthCookie, clearAuthCookie } = require('../utils/authCookie');

/**
 * Bỏ JWT khỏi thân phản hồi trừ khi client tự khai là 'mobile'.
 *
 * Web nhận phiên qua cookie httpOnly — trả kèm token trong JSON là tự tay đưa nó
 * về nơi JavaScript đọc được, đúng thứ mà cookie httpOnly sinh ra để tránh. Client
 * native không dùng được cookie nên vẫn cần token: gửi `clientType: 'mobile'`
 * trong body (cùng quy ước đã dùng ở forgot-password) để nhận.
 */
const authResponse = (req, data) => {
  if (req.body?.clientType === 'mobile') return data;
  const { token, ...rest } = data;
  void token;
  return rest;
};

const login = asyncHandler(async (req, res) => {
  const data = await authService.login(req.body);
  setAuthCookie(res, data.token);
  sendSuccess(res, { message: 'Login successful', data: authResponse(req, data) });
});

// The route authenticates first so we know WHICH account to revoke; the cookie
// is cleared either way (see routes/user/auth.routes.js for the 401 path).
const logout = asyncHandler(async (req, res) => {
  await authService.revokeSessions(req.user._id);
  clearAuthCookie(res);
  sendSuccess(res, { message: 'Logged out successfully' });
});

const getMe = asyncHandler(async (req, res) => {
  const user = await authService.getProfile(req.user.id);
  sendSuccess(res, { data: { user } });
});

const forgotPassword = asyncHandler(async (req, res) => {
  await authService.forgotPassword(req.body.email, req.body.clientType);
  // Always return 200 regardless of whether email exists (prevent enumeration)
  sendSuccess(res, {
    message: 'If that email is registered, a reset link has been sent.',
  });
});

const resetPassword = asyncHandler(async (req, res) => {
  const data = await authService.resetPassword(req.body.token, req.body.newPassword);
  sendSuccess(res, {
    message: 'Password has been reset successfully',
    data: authResponse(req, data),
  });
});

// Always the same 200 + message, whether or not an OTP was actually sent —
// see requestRegistration: revealing "email already registered" here let anyone
// enumerate accounts.
const registerRequest = asyncHandler(async (req, res) => {
  await authService.requestRegistration(req.body);
  sendSuccess(res, {
    message: 'If that email can be registered, a verification code has been sent to it.',
  });
});

const registerVerify = asyncHandler(async (req, res) => {
  const data = await authService.verifyOtpAndRegister(req.body);
  setAuthCookie(res, data.token);
  sendSuccess(res, {
    statusCode: 201,
    message: 'Registration successful',
    data: authResponse(req, data),
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
  // Đặt cookie như mọi lối đăng nhập khác để web dùng được đường này, thay vì chỉ
  // phát token trần trong body.
  setAuthCookie(res, data.token);
  sendSuccess(res, {
    message: 'Password has been reset successfully',
    data: authResponse(req, data),
  });
});

module.exports = {
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
