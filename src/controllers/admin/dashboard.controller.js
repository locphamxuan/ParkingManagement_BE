const asyncHandler = require("../../utils/asyncHandler");
const { sendSuccess } = require("../../utils/response");
const service = require("../../services/admin/dashboard.service");

const getOverview = asyncHandler(async (_req, res) => {
  const data = await service.getOverview();
  sendSuccess(res, { data });
});

module.exports = { getOverview };
