const asyncHandler = require("../../utils/asyncHandler");
const { sendSuccess } = require("../../utils/response");
const service = require("../../services/manager/feedback.service");

const list = asyncHandler(async (req, res) => {
  const data = await service.list(req.user, req.params.buildingId, req.query);
  sendSuccess(res, { data });
});

const respond = asyncHandler(async (req, res) => {
  const item = await service.respond(
    req.user,
    req.params.buildingId,
    req.params.id,
    req.body
  );
  sendSuccess(res, { message: "Feedback updated", data: { item } });
});

module.exports = { list, respond };
