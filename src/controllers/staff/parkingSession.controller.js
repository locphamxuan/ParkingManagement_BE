const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/response');
const parkingSessionService = require('../../services/staff/parkingSession.service');

const checkIn = asyncHandler(async (req, res) => {
  const payload = req.body;
  const session = await parkingSessionService.checkIn(req.user, payload);
  sendSuccess(res, { data: session });
});

const checkOut = asyncHandler(async (req, res) => {
  const session = await parkingSessionService.checkOut(req.user, req.params.id, req.body);
  sendSuccess(res, { data: session });
});

const listActive = asyncHandler(async (req, res) => {
  const items = await parkingSessionService.listActive(req.user, req.query);
  sendSuccess(res, { data: { items } });
});

const getById = asyncHandler(async (req, res) => {
  const session = await parkingSessionService.getById(req.user, req.params.id);
  sendSuccess(res, { data: session });
});

const search = asyncHandler(async (req, res) => {
  const items = await parkingSessionService.search(req.user, req.query.plate, req.query);
  sendSuccess(res, { data: { items } });
});

module.exports = { checkIn, checkOut, listActive, getById, search };
