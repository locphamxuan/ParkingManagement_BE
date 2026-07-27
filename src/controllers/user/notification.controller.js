const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/response');
const service = require('../../services/user/notification.service');

const list = asyncHandler(async (req, res) => {
  const data = await service.list(req.user._id);
  sendSuccess(res, { data });
});

const markRead = asyncHandler(async (req, res) => {
  const data = await service.markRead(req.user._id, req.params.id);
  sendSuccess(res, { data });
});

const markAllRead = asyncHandler(async (req, res) => {
  const data = await service.markAllRead(req.user._id);
  sendSuccess(res, { data });
});

module.exports = { list, markRead, markAllRead };
