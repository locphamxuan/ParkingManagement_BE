const asyncHandler = require("../../utils/asyncHandler");
const { sendSuccess } = require("../../utils/response");
const buildingService = require("../../services/building.service");

const listBuildings = asyncHandler(async (req, res) => {
  const data = await buildingService.listBuildings(req.query);
  sendSuccess(res, { data });
});

const getBuilding = asyncHandler(async (req, res) => {
  const building = await buildingService.getBuildingOrFail(req.params.id);
  sendSuccess(res, { data: { building } });
});

const createBuilding = asyncHandler(async (req, res) => {
  const building = await buildingService.createBuilding(req.body);
  sendSuccess(res, {
    statusCode: 201,
    message: "Building created successfully",
    data: { building },
  });
});

const updateBuilding = asyncHandler(async (req, res) => {
  const building = await buildingService.updateBuilding(
    req.params.id,
    req.body,
  );
  sendSuccess(res, {
    message: "Building updated successfully",
    data: { building },
  });
});

const updateBuildingStatus = asyncHandler(async (req, res) => {
  const building = await buildingService.updateBuildingStatus(
    req.params.id,
    req.body.status,
  );
  sendSuccess(res, {
    message: "Building status updated successfully",
    data: { building },
  });
});

const deleteBuilding = asyncHandler(async (req, res) => {
  await buildingService.removeBuilding(req.params.id);
  sendSuccess(res, {
    message: "Building deleted successfully",
    data: null,
  });
});

module.exports = {
  listBuildings,
  getBuilding,
  createBuilding,
  updateBuilding,
  updateBuildingStatus,
  deleteBuilding,
};
