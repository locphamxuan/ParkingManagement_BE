const User = require("../models/User");
const BuildingManager = require("../models/BuildingManager");
const AppError = require("../utils/AppError");
const asyncHandler = require("../utils/asyncHandler");
const { verifyToken } = require("../utils/token");

const authenticate = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    throw new AppError("Access denied. No token provided.", 401);
  }

  const { id } = verifyToken(header.slice(7));
  const user = await User.findById(id);
  if (!user) throw new AppError("User no longer exists", 401);

  // populate assignedBuildings via BuildingManager assignments
  const assignments = await BuildingManager.find({
    user: id,
    isActive: true,
  }).populate({
    path: "building",
    select: "name code status isActive",
  });
  user.assignedBuildings = assignments.map((a) =>
    a.building._id ? a.building._id : a.building,
  );

  if (!user) throw new AppError("User no longer exists", 401);
  if (!user.isActive) throw new AppError("Account is deactivated", 403);

  req.user = user;
  next();
});

module.exports = { authenticate };
