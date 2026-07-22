const User = require("../models/user/User");
const BuildingManager = require("../models/building/BuildingManager");
const AppError = require("../utils/AppError");
const asyncHandler = require("../utils/asyncHandler");
const { verifyToken } = require("../utils/token");

const authenticate = asyncHandler(async (req, _res, next) => {
  // Web clients authenticate via the httpOnly cookie set on login (never
  // readable/stealable from JS); Mobile has no browser cookie jar, so it
  // keeps sending the token as a Bearer header from its own secure storage.
  const header = req.headers.authorization;
  const token = req.cookies?.token || (header?.startsWith("Bearer ") ? header.slice(7) : null);

  if (!token) {
    throw new AppError("Access denied. No token provided.", 401);
  }

  const { id } = verifyToken(token);
  const user = await User.findById(id);
  if (!user) throw new AppError("User no longer exists", 401);
  if (!user.isActive) throw new AppError("Account is deactivated", 403);

  const assignments = await BuildingManager.find({ user: id, isActive: true }).select('building');
  user.assignedBuildings = assignments.map((a) => a.building);

  req.user = user;
  next();
});

module.exports = { authenticate };

