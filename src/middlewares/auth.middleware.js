const User = require("../models/user/User");
const BuildingManager = require("../models/building/BuildingManager");
const AppError = require("../utils/AppError");
const asyncHandler = require("../utils/asyncHandler");
const { verifyToken } = require("../utils/token");
const { COOKIE_NAME } = require("../utils/authCookie");

const authenticate = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization;
  // Web client authenticates via httpOnly cookie; a handful of call sites
  // (mobile app, a few admin pages) still send an explicit Bearer header —
  // header takes priority when both are present.
  const token = header?.startsWith("Bearer ") ? header.slice(7) : req.cookies?.[COOKIE_NAME];

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

