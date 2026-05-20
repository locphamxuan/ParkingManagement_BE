const asyncHandler = require("../../utils/asyncHandler");
const { sendSuccess } = require("../../utils/response");
const service = require("../../services/admin/audit.service");

const list = asyncHandler(async (req, res) => {
  const data = await service.list(req.query);
  sendSuccess(res, { data });
});

module.exports = { list };
