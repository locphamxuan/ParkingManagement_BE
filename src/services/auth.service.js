const User = require('../models/user/User');
const Building = require('../models/building/Building');
const BuildingManager = require('../models/building/BuildingManager');
const AppError = require('../utils/AppError');
const { signToken } = require('../utils/token');
const { ROLES } = require('../constants/roles');

const toPublicUser = (user) => user.toJSON();

const buildAuthResponse = (user) => ({
  token: signToken(user._id),
  user: toPublicUser(user),
});

const register = async (body) => {
  const { email, password, fullName, phone, role, buildingName, buildingAddress } = body;

  const exists = await User.exists({ email });
  if (exists) throw new AppError('Email already registered', 409);

  const allowedRoles = [ROLES.MANAGER, ROLES.STAFF];
  const userRole = allowedRoles.includes(role) ? role : ROLES.USER;

  const user = await User.create({ email, password, fullName, phone, role: userRole });

  if (userRole === ROLES.MANAGER && buildingName) {
    const code = ('BLD' + Date.now().toString(36)).toUpperCase();
    const building = await Building.create({
      name: buildingName.trim(),
      code,
      address: { fullAddress: (buildingAddress || '').trim() },
      totalFloors: 1,
      pricing: { hourlyRate: 0 },
      status: 'active',
      manager: user._id,
    });
    await BuildingManager.create({ building: building._id, user: user._id });
    await User.updateOne({ _id: user._id }, { $set: { assignedBuildings: [building._id] } });
  }

  const fresh = await User.findById(user._id);
  return buildAuthResponse(fresh);
};

const login = async ({ email, password }) => {
  const user = await User.findOne({ email }).select('+password');

  if (!user || !(await user.comparePassword(password))) {
    throw new AppError('Invalid email or password', 401);
  }
  if (!user.isActive) {
    throw new AppError('Account is deactivated', 403);
  }

  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  return buildAuthResponse(user);
};

const getProfile = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found', 404);
  return toPublicUser(user);
};

module.exports = { register, login, getProfile };

