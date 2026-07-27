const asyncHandler = require("../../utils/asyncHandler");
const { sendSuccess } = require("../../utils/response");
const service = require("../../services/manager/gate.service");

const list = asyncHandler(async (req, res) => {
  const items = await service.list(req.user, req.params.buildingId);
  sendSuccess(res, { data: { items } });
});

const create = asyncHandler(async (req, res) => {
  const item = await service.create(req.user, req.params.buildingId, req.body);
  sendSuccess(res, { statusCode: 201, message: "Gate created", data: { item } });
});

const update = asyncHandler(async (req, res) => {
  const item = await service.update(
    req.user,
    req.params.buildingId,
    req.params.id,
    req.body
  );
  sendSuccess(res, { message: "Gate updated", data: { item } });
});

const remove = asyncHandler(async (req, res) => {
  await service.remove(req.user, req.params.buildingId, req.params.id);
  sendSuccess(res, { message: "Gate removed", data: null });
});

const updateStatus = asyncHandler(async (req, res) => {
  const item = await service.updateStatus(
    req.user,
    req.params.buildingId,
    req.params.id,
    req.body.status
  );
  sendSuccess(res, { message: "Gate status updated", data: { item } });
});

module.exports = { list, create, update, remove, updateStatus };
