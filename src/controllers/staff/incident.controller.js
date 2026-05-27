const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/response');
const incidentService = require('../../services/staff/incident.service');

/**
 * POST /staff/incidents
 * Tạo phiếu sự cố mới.
 */
const createIncident = asyncHandler(async (req, res) => {
  const result = await incidentService.createIncident(req.user, req.body);
  sendSuccess(res, {
    statusCode: 201,
    message: 'Tạo báo cáo sự cố thành công',
    data: result,
  });
});

/**
 * GET /staff/incidents
 * Liệt kê sự cố theo building của staff.
 * Query: buildingId?, status?, severity?, page?, limit?
 */
const listIncidents = asyncHandler(async (req, res) => {
  const result = await incidentService.listIncidents(req.user, req.query);
  sendSuccess(res, {
    message: 'Lấy danh sách sự cố thành công',
    data: result,
  });
});

module.exports = { createIncident, listIncidents };
