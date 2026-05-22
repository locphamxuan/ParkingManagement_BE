const asyncHandler = require("../../utils/asyncHandler");
const { sendSuccess } = require("../../utils/response");
const incidentService = require("../../services/staff/incident.service");

const createIncidentReport = asyncHandler(async (req, res) => {
  const { building, title, description, severity } = req.body;
  const staffId = req.user._id;

  const result = await incidentService.createIncidentReport({
    buildingId: building,
    title,
    description,
    severity,
    staffId
  });

  sendSuccess(res, "Tạo báo cáo sự cố hệ thống thành công", result);
});

module.exports = {
  createIncidentReport,
};