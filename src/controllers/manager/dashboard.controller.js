const asyncHandler = require("../../utils/asyncHandler");
const { sendSuccess } = require("../../utils/response");
const service = require("../../services/manager/dashboard.service");

const getOverview = asyncHandler(async (req, res) => {
  const data = await service.getOverview(req.user, req.params.buildingId);
  sendSuccess(res, { data });
});

module.exports = { getOverview };
