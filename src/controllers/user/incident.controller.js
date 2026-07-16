const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/response');
const service = require('../../services/user/incident.service');

const createIncident = asyncHandler(async (req, res) => {
  const result = await service.createIncident(req.user._id, req.body);
  sendSuccess(res, { statusCode: 201, message: 'Incident reported', data: result });
});

const listMyIncidents = asyncHandler(async (req, res) => {
  const data = await service.listMyIncidents(req.user._id, req.query);
  sendSuccess(res, { data });
});

module.exports = { createIncident, listMyIncidents };
