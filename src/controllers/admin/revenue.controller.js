const asyncHandler = require("../../utils/asyncHandler");
const { sendSuccess } = require("../../utils/response");
const service = require("../../services/admin/revenue.service");

const getReport = asyncHandler(async (req, res) => {
  const { from, to, buildingId } = req.query;
  const data = await service.getReport({ from, to, buildingId });
  sendSuccess(res, { data });
});

const getSubscriptionTransfers = asyncHandler(async (req, res) => {
  const { from, to, buildingId } = req.query;
  const data = await service.getSubscriptionTransfers({ from, to, buildingId });
  sendSuccess(res, { data });
});

module.exports = { getReport, getSubscriptionTransfers };
