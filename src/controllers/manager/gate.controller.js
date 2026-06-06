const asyncHandler = require("../../utils/asyncHandler");
const { sendSuccess } = require("../../utils/response");
const service = require("../../services/manager/gate.service");

// Cổng ra/vào cố định — manager chỉ xem + đổi trạng thái (không thêm/sửa/xóa).
const list = asyncHandler(async (req, res) => {
  const items = await service.list(req.user, req.params.buildingId);
  sendSuccess(res, { data: { items } });
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

module.exports = { list, updateStatus };
