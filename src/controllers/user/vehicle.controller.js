const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/response');
const service = require('../../services/user/vehicle.service');
const qrService = require('../../services/user/vehicleQr.service');
const { VEHICLE_CATEGORIES } = require('../../constants/vehicle');

const list = asyncHandler(async (req, res) => {
  const vehicles = await service.list(req.user._id);
  sendSuccess(res, { data: { vehicles } });
});

const getOne = asyncHandler(async (req, res) => {
  const vehicle = await service.getOne(req.user._id, req.params.vehicleId);
  sendSuccess(res, { data: { vehicle } });
});

const add = asyncHandler(async (req, res) => {
  const vehicle = await service.add(req.user._id, req.body);
  sendSuccess(res, { statusCode: 201, message: 'Đã thêm phương tiện', data: { vehicle } });
});

const update = asyncHandler(async (req, res) => {
  const vehicle = await service.update(req.user._id, req.params.vehicleId, req.body);
  sendSuccess(res, { message: 'Đã cập nhật phương tiện', data: { vehicle } });
});

const remove = asyncHandler(async (req, res) => {
  const vehicles = await service.remove(req.user._id, req.params.vehicleId);
  sendSuccess(res, { message: 'Đã xoá phương tiện', data: { vehicles } });
});

const setDefault = asyncHandler(async (req, res) => {
  const vehicles = await service.setDefault(req.user._id, req.params.vehicleId);
  sendSuccess(res, { message: 'Đã đặt xe mặc định', data: { vehicles } });
});

const refreshQr = asyncHandler(async (req, res) => {
  const vehicle = await qrService.rotateQr(req.user._id, req.params.vehicleId);
  sendSuccess(res, { message: 'Đã cấp mã QR mới', data: { vehicle } });
});

/**
 * Danh mục thể loại xe của hệ thống — FE dựng dropdown từ đây thay vì tự chép
 * danh sách cứng trong code giao diện.
 */
const listCategories = (_req, res) => {
  sendSuccess(res, {
    data: {
      categories: VEHICLE_CATEGORIES.map(({ code, label }) => ({ code, label })),
      qrTtlDays: qrService.qrTtlDays(),
    },
  });
};

module.exports = { list, getOne, add, update, remove, setDefault, refreshQr, listCategories };
