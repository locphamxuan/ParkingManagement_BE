const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/response');
const service = require('../../services/user/licensePlate.service');

const list = asyncHandler(async (req, res) => {
  const plates = await service.list(req.user._id);
  sendSuccess(res, { data: { licensePlates: plates } });
});

const add = asyncHandler(async (req, res) => {
  const plates = await service.add(req.user._id, req.body);
  sendSuccess(res, { statusCode: 201, message: 'License plate added', data: { licensePlates: plates } });
});

const update = asyncHandler(async (req, res) => {
  const plates = await service.update(req.user._id, req.params.plateId, req.body);
  sendSuccess(res, { message: 'License plate updated', data: { licensePlates: plates } });
});

const remove = asyncHandler(async (req, res) => {
  const plates = await service.remove(req.user._id, req.params.plateId);
  sendSuccess(res, { message: 'License plate removed', data: { licensePlates: plates } });
});

const setDefault = asyncHandler(async (req, res) => {
  const plates = await service.setDefault(req.user._id, req.params.plateId);
  sendSuccess(res, { message: 'Default plate set', data: { licensePlates: plates } });
});

module.exports = { list, add, update, remove, setDefault };
