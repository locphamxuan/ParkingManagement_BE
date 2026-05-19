const AppError = require("../utils/AppError");
const { ROLES } = require("../constants/roles");
const buildingRepository = require("../repositories/building.repository");

const buildListFilter = (query = {}) => {
  const filter = {};

  if (query.status) {
    filter.status = query.status;
  }

  if (query.isActive !== undefined) {
    filter.isActive = query.isActive === "true" || query.isActive === true;
  }

  if (query.search?.trim()) {
    const search = query.search.trim();
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { code: { $regex: search, $options: "i" } },
      { "address.fullAddress": { $regex: search, $options: "i" } },
    ];
  }

  return filter;
};

const parsePagination = (query = {}) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 10, 1), 100);

  return { page, limit };
};

const getBuildingOrFail = async (id) => {
  const building = await buildingRepository.findById(id);
  if (!building) {
    throw new AppError("Building not found", 404);
  }
  return building;
};

const listBuildings = async (query = {}) => {
  const filter = buildListFilter(query);
  const { page, limit } = parsePagination(query);
  const [items, total] = await Promise.all([
    buildingRepository.list({ filter, page, limit }),
    buildingRepository.count(filter),
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const createBuilding = async (payload) => buildingRepository.create(payload);

const updateBuilding = async (id, payload) => {
  const updated = await buildingRepository.updateById(id, payload);
  if (!updated) {
    throw new AppError("Building not found", 404);
  }
  return updated;
};

const updateBuildingStatus = async (id, status) => {
  const updated = await buildingRepository.updateById(id, { status });
  if (!updated) {
    throw new AppError("Building not found", 404);
  }
  return updated;
};

const removeBuilding = async (id) => {
  const deleted = await buildingRepository.deleteById(id);
  if (!deleted) {
    throw new AppError("Building not found", 404);
  }
  return deleted;
};

const getManagerBuilding = async (user, buildingId) => {
  const assignedBuildings = Array.isArray(user.assignedBuildings)
    ? user.assignedBuildings
    : [];

  if (buildingId) {
    const assignedIds = assignedBuildings.map(
      (building) => `${building._id || building}`,
    );
    if (!assignedIds.includes(`${buildingId}`)) {
      throw new AppError("Forbidden for this building", 403);
    }

    return getBuildingOrFail(buildingId);
  }

  if (assignedBuildings.length === 0) {
    throw new AppError("No building assiged", 404);
  }

  const assignedIds = assignedBuildings.map(
    (building) => building._id || building,
  );
  const buildings = await buildingRepository.list({
    filter: { _id: { $in: assignedIds } },
    page: 1,
    limit: 1000,
  });

  return buildings;
};

const updateManagerBuilding = async (user, buildingId, payload) => {
  // buildingId is required for update
  if (!buildingId) {
    throw new AppError("buildingId is required for update", 400);
  }

  const assignedBuildings = Array.isArray(user.assignedBuildings)
    ? user.assignedBuildings
    : [];
  const assignedIds = assignedBuildings.map(
    (building) => `${building._id || building}`,
  );
  if (!assignedIds.includes(`${buildingId}`)) {
    throw new AppError("Forbidden for this building", 403);
  }

  const building = await getBuildingOrFail(buildingId);

  // Only allow updates to active buildings
  if (building.status !== "active") {
    throw new AppError("Can only update buildings with status=active", 403);
  }

  return updateBuilding(buildingId, payload);
};

module.exports = {
  listBuildings,
  getBuildingOrFail,
  createBuilding,
  updateBuilding,
  updateBuildingStatus,
  removeBuilding,
  getManagerBuilding,
  updateManagerBuilding,
};
