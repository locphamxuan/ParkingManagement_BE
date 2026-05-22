const asyncHandler = require("../../utils/asyncHandler");
const { sendSuccess } = require("../../utils/response");
const buildingAccessService = require("../../services/staff/buildingAccess.service");

const getDashboard = asyncHandler(async (req, res) => {
  const data = await buildingAccessService.getDashboard(req.user);
  sendSuccess(res, "Lấy thông tin tổng quan thành công", data);
});

const listAssignedBuildings = asyncHandler(async (req, res) => {
  const data = await buildingAccessService.listAssignedBuildings(req.user);
  sendSuccess(res, "Lấy danh sách tòa nhà được gán thành công", data);
});

const getAssignedBuilding = asyncHandler(async (req, res) => {
  const building = await buildingAccessService.getAssignedBuilding(
    req.user,
    req.params.id
  );
  sendSuccess(res, "Lấy chi tiết tòa nhà thành công", { building });
});

module.exports = {
  getDashboard,
  listAssignedBuildings,
  getAssignedBuilding,
};