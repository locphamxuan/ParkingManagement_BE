const asyncHandler = require("../../utils/asyncHandler");
const { sendSuccess } = require("../../utils/response");
const service = require("../../services/admin/pricePolicy.service");

const list = asyncHandler(async (req, res) => {
  const items = await service.list(req.query);
  sendSuccess(res, { data: { items } });
});

const push = asyncHandler(async (req, res) => {
  const { buildingId, vehicleTypeId, ...payload } = req.body;
  const policy = await service.push({
    buildingId,
    vehicleTypeId,
    payload,
    actor: req.user,
  });
  sendSuccess(res, {
    statusCode: 201,
    message: "Price policy pushed successfully",
    data: { policy },
  });
});

const listPushLogs = asyncHandler(async (req, res) => {
  const data = await service.listPushLogs(req.query);
  sendSuccess(res, { data });
});

module.exports = { list, push, listPushLogs };
