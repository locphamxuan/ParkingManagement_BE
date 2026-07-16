const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/response');
const service = require('../../services/manager/incident.service');

const list = asyncHandler(async (req, res) => {
  const data = await service.list(req.user, req.params.buildingId, req.query);
  sendSuccess(res, { data });
});

const resolve = asyncHandler(async (req, res) => {
  const result = await service.resolve(req.user, req.params.buildingId, req.params.id, req.body);
  sendSuccess(res, { message: 'Cập nhật xử lý sự cố thành công', data: result });
});

module.exports = { list, resolve };
