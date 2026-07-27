const asyncHandler = require("../../utils/asyncHandler");
const { sendSuccess } = require("../../utils/response");
const service = require("../../services/manager/customer.service");

const list = asyncHandler(async (req, res) => {
  const data = await service.listCustomers(
    req.user,
    req.params.buildingId,
    req.query
  );
  sendSuccess(res, { data });
});

module.exports = { list };
