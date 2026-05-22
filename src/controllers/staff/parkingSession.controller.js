const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/response');
const parkingService = require('../../services/parkingSession.service');

const checkIn = asyncHandler(async (req, res) => {
  const payload = req.body;
  const session = await parkingService.checkIn(req.user, payload);
  sendSuccess(res, { data: session });
});

const checkOut = asyncHandler(async (req, res) => {
  const session = await parkingService.checkOut(req.user, req.params.id, req.body);
  sendSuccess(res, { data: session });
});

const listActive = asyncHandler(async (req, res) => {
  const items = await parkingService.listActive(req.user, req.query);
  sendSuccess(res, { data: { items } });
});

const getById = asyncHandler(async (req, res) => {
  const session = await parkingService.getById(req.user, req.params.id);
  sendSuccess(res, { data: session });
});

const search = asyncHandler(async (req, res) => {
  const items = await parkingService.search(req.user, req.query.plate, req.query);
  sendSuccess(res, { data: { items } });
});

module.exports = { checkIn, checkOut, listActive, getById, search };
