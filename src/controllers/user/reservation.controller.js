const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/response');
const service = require('../../services/user/reservation.service');

const list = asyncHandler(async (req, res) => {
  const data = await service.list(req.user._id, req.query);
  sendSuccess(res, { data });
});

const get = asyncHandler(async (req, res) => {
  const reservation = await service.get(req.user._id, req.params.id);
  sendSuccess(res, { data: { reservation } });
});

const create = asyncHandler(async (req, res) => {
  const reservation = await service.create(req.user._id, req.body);
  sendSuccess(res, { statusCode: 201, message: 'Reservation created', data: { reservation } });
});

const cancel = asyncHandler(async (req, res) => {
  const reservation = await service.cancel(req.user._id, req.params.id);
  sendSuccess(res, { message: 'Reservation cancelled', data: { reservation } });
});

module.exports = { list, get, create, cancel };
