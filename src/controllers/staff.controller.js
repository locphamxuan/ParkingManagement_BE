const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/response");
const staffService = require("../services/staff.service");

const getDashboard = asyncHandler(async (req, res) => {
  const data = await staffService.getDashboard(req.user);
  sendSuccess(res, { data });
});

const listAssignedBuildings = asyncHandler(async (req, res) => {
  const data = await staffService.listAssignedBuildings(req.user);
  sendSuccess(res, { data });
});

const getAssignedBuilding = asyncHandler(async (req, res) => {
  const building = await staffService.getAssignedBuilding(
    req.user,
    req.params.id,
  );

  sendSuccess(res, { data: { building } });
});

module.exports = {
  getDashboard,
  listAssignedBuildings,
  getAssignedBuilding,
};