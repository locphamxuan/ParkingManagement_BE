const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/response');
const service = require('../../services/staff/shift.service');

const listMyShifts = asyncHandler(async (req, res) => {
  const items = await service.listMyShifts(req.user, req.query);
  sendSuccess(res, { data: { items } });
});

const submitShiftReport = asyncHandler(async (req, res) => {
  const item = await service.submitShiftReport(req.user, req.params.id);
  sendSuccess(res, { message: 'Shift report submitted', data: { item } });
});

module.exports = { listMyShifts, submitShiftReport };
