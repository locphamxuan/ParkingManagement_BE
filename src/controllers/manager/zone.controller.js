const asyncHandler = require("../../utils/asyncHandler");
const { sendSuccess } = require("../../utils/response");
const service = require("../../services/manager/zone.service");

const list = asyncHandler(async (req, res) => {
  const items = await service.list(req.user, req.params.buildingId, req.query);
  sendSuccess(res, { data: { items } });
});

const create = asyncHandler(async (req, res) => {
  const item = await service.create(req.user, req.params.buildingId, req.body);
  sendSuccess(res, {
    statusCode: 201,
    message: "Zone created",
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
  sendSuccess(res, { message: "Zone updated", data: { item } });
});

const remove = asyncHandler(async (req, res) => {
  await service.remove(req.user, req.params.buildingId, req.params.id);
  sendSuccess(res, { message: "Zone removed", data: null });
});

module.exports = { list, create, update, remove };
