const AppError = require("../utils/AppError");
const buildingRepository = require("../repositories/building.repository");

const normalizeBuildingId = (building) => `${building._id || building}`;

const getAssignedBuildingIds = (user) =>
  Array.isArray(user?.assignedBuildings)
    ? user.assignedBuildings.map((building) => normalizeBuildingId(building))
    : [];

const fetchAssignedBuildings = async (user) => {
  const assignedIds = getAssignedBuildingIds(user);

  if (assignedIds.length === 0) {
    return [];
  }

  return buildingRepository.list({
    filter: { _id: { $in: assignedIds } },
    page: 1,
    limit: 1000,
    sort: "name",
  });
};

const getDashboard = async (user) => {
  const buildings = await fetchAssignedBuildings(user);
  const activeBuildings = buildings.filter((building) => building.status === "active");
  const maintenanceBuildings = buildings.filter(
    (building) => building.status === "maintenance",
  );

  return {
    user: {
      id: user._id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      lastLoginAt: user.lastLoginAt,
    },
    summary: {
      assignedBuildingCount: buildings.length,
      activeBuildingCount: activeBuildings.length,
      maintenanceBuildingCount: maintenanceBuildings.length,
    },
    buildings,
  };
};

const listAssignedBuildings = async (user) => {
  const buildings = await fetchAssignedBuildings(user);

  return {
    items: buildings,
    meta: {
      total: buildings.length,
    },
  };
};

const getAssignedBuilding = async (user, buildingId) => {
  const assignedIds = getAssignedBuildingIds(user);

  if (!buildingId) {
    throw new AppError("buildingId is required", 400);
  }

  if (!assignedIds.includes(`${buildingId}`)) {
    throw new AppError("Forbidden for this building", 403);
  }

  const building = await buildingRepository.findById(buildingId);
  if (!building) {
    throw new AppError("Building not found", 404);
  }

  return building;
};

module.exports = {
  getDashboard,
  listAssignedBuildings,
  getAssignedBuilding,
};