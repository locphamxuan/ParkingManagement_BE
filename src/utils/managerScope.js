const AppError = require("./AppError");
const { ROLES } = require("../constants/roles");

const getAssignedBuildingIds = (user) => {
  const list = Array.isArray(user?.assignedBuildings)
    ? user.assignedBuildings
    : [];
  return list.map((b) => String(b._id || b));
};

const ensureManagerOwnsBuilding = (user, buildingId) => {
  if (!user) throw new AppError("Authentication required", 401);
  if (user.role === ROLES.ADMIN) return true;
  if (user.role !== ROLES.MANAGER) {
    throw new AppError("Forbidden", 403);
  }
  if (!buildingId) throw new AppError("buildingId is required", 400);

  const ids = getAssignedBuildingIds(user);
  if (!ids.includes(String(buildingId))) {
    throw new AppError("Forbidden for this building", 403);
  }
  return true;
};

const resolveManagerBuildingId = (user, fallback) => {
  const explicit = fallback || null;
  if (explicit) {
    ensureManagerOwnsBuilding(user, explicit);
    return String(explicit);
  }
  if (user.role === ROLES.ADMIN) {
    throw new AppError("buildingId is required", 400);
  }
  const ids = getAssignedBuildingIds(user);
  if (ids.length === 0) {
    throw new AppError("No building assigned", 404);
  }
  return ids[0];
};

module.exports = {
  getAssignedBuildingIds,
  ensureManagerOwnsBuilding,
  resolveManagerBuildingId,
};
