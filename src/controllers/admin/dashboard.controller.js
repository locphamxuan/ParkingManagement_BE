const asyncHandler = require("../../utils/asyncHandler");
const { sendSuccess } = require("../../utils/response");
const AppError = require("../../utils/AppError");
const service = require("../../services/admin/dashboard.service");

const VALID_PERIODS = ["today", "week", "month"];

const getOverview = asyncHandler(async (req, res) => {
  const period = req.query.period || "today";
  if (!VALID_PERIODS.includes(period)) {
    throw new AppError(`period must be one of: ${VALID_PERIODS.join(", ")}`, 400);
  }
  const data = await service.getOverview(period);
  sendSuccess(res, { data });
});

module.exports = { getOverview };
