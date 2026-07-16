const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/response');
const service = require('../../services/staff/shift.service');

const listMyShifts = asyncHandler(async (req, res) => {
  const items = await service.listMyShifts(req.user, req.query);
  sendSuccess(res, { data: { items } });
});

module.exports = { listMyShifts };
