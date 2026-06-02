const asyncHandler = require("../../utils/asyncHandler");
const { sendSuccess } = require("../../utils/response");
const service = require("../../services/manager/pricing.service");

const list = asyncHandler(async (req, res) => {
  const items = await service.list(req.user, req.params.buildingId, req.query);
  sendSuccess(res, { data: { items } });
});

const create = asyncHandler(async (req, res) => {
  const item = await service.create(req.user, req.params.buildingId, req.body);
  sendSuccess(res, {
    statusCode: 201,
    message: "Price policy created",
    data: { item },
  });
});

const update = asyncHandler(async (req, res) => {
  const item = await service.update(
    req.user,
    req.params.buildingId,
    req.params.id,
    req.body
  );
  sendSuccess(res, { message: "Price policy updated", data: { item } });
});

const deactivate = asyncHandler(async (req, res) => {
  const item = await service.deactivate(
    req.user,
    req.params.buildingId,
    req.params.id
  );
  sendSuccess(res, { message: "Price policy deactivated", data: { item } });
});

const listPushLogs = asyncHandler(async (req, res) => {
  const data = await service.listPushLogs(
    req.user,
    req.params.buildingId,
    req.query
  );
  sendSuccess(res, { data });
});

module.exports = { list, create, update, deactivate, listPushLogs };
