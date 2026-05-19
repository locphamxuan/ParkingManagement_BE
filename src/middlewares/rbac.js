const AppError = require("../utils/AppError");
const { ROLES } = require("../constants/roles");

const authorize =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user) {
      return next(new AppError("Authentication required", 401));
    }
    if (!roles.includes(req.user.role)) {
      return next(new AppError("Forbidden", 403));
    }
    next();
  };

const extractBuildingId = (req) =>
  req.params.buildingId ||
  req.params.id ||
  req.query.buildingId ||
  req.body.buildingId;

const authorizeBuildingAccess = (req, _res, next) => {
  if (!req.user) {
    return next(new AppError("Authentication required", 401));
  }

  if (req.user.role === ROLES.ADMIN) {
    return next();
  }

  const buildingId = extractBuildingId(req);
  if (!buildingId) {
    return next(new AppError("buildingId is required", 400));
  }

  const assignedBuildings = Array.isArray(req.user.assignedBuildings)
    ? req.user.assignedBuildings
    : [];
  const allowed = assignedBuildings.some(
    (building) => `${building._id || building}` === `${buildingId}`,
  );

  if (!allowed) {
    return next(new AppError("Forbidden for this building", 403));
  }

  next();
};

module.exports = { authorize, authorizeBuildingAccess };
