const asyncHandler = require("../../utils/asyncHandler");
const { sendSuccess } = require("../../utils/response");
const service = require("../../services/admin/pricePolicy.service");

const list = asyncHandler(async (req, res) => {
  const items = await service.list(req.query);
  sendSuccess(res, { data: { items } });
});

// Read-only: admin xem bảng giá theo building
const listByBuilding = asyncHandler(async (req, res) => {
  const items = await service.list({ ...req.query, buildingId: req.params.id });
  sendSuccess(res, { data: { items } });
});

module.exports = { list, listByBuilding };
