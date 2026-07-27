const asyncHandler = require("../../utils/asyncHandler");
const { sendSuccess } = require("../../utils/response");
const service = require("../../services/admin/revenue.service");

const getReport = asyncHandler(async (req, res) => {
  const { from, to, buildingId } = req.query;
  const data = await service.getReport({ from, to, buildingId });
  sendSuccess(res, { data });
});

const listPayments = asyncHandler(async (req, res) => {
  const data = await service.listPayments(req.query);
  sendSuccess(res, { data });
});

const getReconciliation = asyncHandler(async (req, res) => {
  const data = await service.getReconciliation(req.query);
  sendSuccess(res, { data });
});

module.exports = { getReport, listPayments, getReconciliation };
