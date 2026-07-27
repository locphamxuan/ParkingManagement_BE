const asyncHandler = require("../../utils/asyncHandler");
const { sendSuccess } = require("../../utils/response");
const buildingService = require("../../services/building.service");

const getBuilding = asyncHandler(async (req, res) => {
  const data = await buildingService.getManagerBuilding(
    req.user,
    req.query.buildingId,
  );
  sendSuccess(res, { data });
});

const updateBuilding = asyncHandler(async (req, res) => {
  const building = await buildingService.updateManagerBuilding(
    req.user,
    req.params.id,
    req.body,
  );

  sendSuccess(res, {
    message: "Building updated successfully",
    data: { building },
  });
});

// PUT /manager/buildings/:buildingId/operating-hours
const updateOperatingHours = asyncHandler(async (req, res) => {
  const building = await buildingService.updateManagerOperatingHours(
    req.user,
    req.params.buildingId,
    req.body,
  );
  sendSuccess(res, {
    message: "Operating hours updated successfully",
    data: { building },
  });
});

module.exports = {
  getBuilding,
  updateBuilding,
  updateOperatingHours,
};
