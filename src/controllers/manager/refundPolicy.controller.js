const asyncHandler = require("../../utils/asyncHandler");
const { sendSuccess } = require("../../utils/response");
const service = require("../../services/manager/refundPolicy.service");

const get = asyncHandler(async (req, res) => {
  const item = await service.get(req.user, req.params.buildingId);
  sendSuccess(res, { data: { item } });
});

const upsert = asyncHandler(async (req, res) => {
  const item = await service.upsert(
    req.user,
    req.params.buildingId,
    req.body
  );
  sendSuccess(res, { message: "Refund policy saved", data: { item } });
});

module.exports = { get, upsert };
