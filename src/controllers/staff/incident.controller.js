const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/response');
const incidentService = require('../../services/staff/incident.service');

const createIncidentReport = asyncHandler(async (req, res) => {
  const result = await incidentService.createIncidentReport(req.user, req.body);
  sendSuccess(res, { message: 'Tạo báo cáo sự cố thành công', data: result });
});

module.exports = { createIncidentReport };
