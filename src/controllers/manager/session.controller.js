const asyncHandler = require("../../utils/asyncHandler");
const { sendSuccess } = require("../../utils/response");
const sessionQueryService = require("../../services/staff/parkingSession/query.service");

// Quyền building đã được authorizeBuildingAccess ở route xác thực — chỉ cần filter theo param.
const listParked = asyncHandler(async (req, res) => {
  const items = await sessionQueryService.listActiveByFilter({
    building: req.params.buildingId,
  });
  sendSuccess(res, { data: { items } });
});

const getDetail = asyncHandler(async (req, res) => {
  const session = await sessionQueryService.getByIdInBuilding(
    req.params.buildingId,
    req.params.id,
  );
  sendSuccess(res, { data: session });
});

module.exports = { listParked, getDetail };
