const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/response');
const service = require('../../services/user/profile.service');

const update = asyncHandler(async (req, res) => {
  const user = await service.update(req.user._id, req.body);
  sendSuccess(res, { message: 'Profile updated', data: { user } });
});

const changePassword = asyncHandler(async (req, res) => {
  await service.changePassword(req.user._id, req.body);
  sendSuccess(res, { message: 'Password changed successfully' });
});

module.exports = { update, changePassword };
