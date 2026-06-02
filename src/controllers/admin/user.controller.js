const asyncHandler = require("../../utils/asyncHandler");
const { sendSuccess } = require("../../utils/response");
const service = require("../../services/admin/user.service");

const list = asyncHandler(async (req, res) => {
  const data = await service.list(req.query);
  sendSuccess(res, { data });
});

const get = asyncHandler(async (req, res) => {
  const user = await service.getById(req.params.id);
  sendSuccess(res, { data: { user } });
});

const create = asyncHandler(async (req, res) => {
  const user = await service.create(req.user, req.body);
  sendSuccess(res, {
    statusCode: 201,
    message: "User created",
    data: { user },
  });
});

const update = asyncHandler(async (req, res) => {
  const user = await service.update(req.user, req.params.id, req.body);
  sendSuccess(res, { message: "User updated", data: { user } });
});

const updateStatus = asyncHandler(async (req, res) => {
  const user = await service.updateStatus(
    req.user,
    req.params.id,
    req.body.isActive
  );
  sendSuccess(res, { message: "User status updated", data: { user } });
});

const remove = asyncHandler(async (req, res) => {
  const force = req.query.force === 'true';
  await service.remove(req.user, req.params.id, { force });
  sendSuccess(res, { message: "User removed", data: null });
});

module.exports = { list, get, create, update, updateStatus, remove };
