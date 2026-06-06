const asyncHandler = require("../../utils/asyncHandler");
const { sendSuccess } = require("../../utils/response");
const buildingService = require("../../services/building.service");
const buildingManagerService = require("../../services/buildingManager.service");
const subscriptionService = require("../../services/manager/subscription.service");
const gateService = require("../../services/manager/gate.service");

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
  // Tự sinh 2 cổng cố định (Cổng vào / Cổng ra) cho tòa nhà mới.
  await gateService.ensureDefaultGates(building._id);
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

const getBuildingMembers = asyncHandler(async (req, res) => {
  const members = await buildingManagerService.getBuildingMembers(req.params.id);
  // Include the building's admin-system subscription status so admins can see
  // whether this building's manager has purchased a package.
  const subscription = await subscriptionService.getStatus(req.params.id);
  sendSuccess(res, { data: { ...members, subscription } });
});

const AppError = require('../../utils/AppError');
const AdminSubscriptionPackage = require('../../models/finance/AdminSubscriptionPackage');

// Admin grants (or extends) a subscription for a building's manager — no wallet charge.
const grantSubscription = asyncHandler(async (req, res) => {
  const { packageId } = req.body;
  if (!packageId) throw new AppError('packageId is required', 400);

  const pkg = await AdminSubscriptionPackage.findById(packageId);
  if (!pkg) throw new AppError('Subscription package not found', 404);

  const members = await buildingManagerService.getBuildingMembers(req.params.id);
  const managerId = members.manager?._id ?? null;

  // amountPaid = 0 → flags this as an admin grant rather than a paid purchase.
  await subscriptionService.recordSubscription(req.params.id, managerId, pkg, 0);
  const subscription = await subscriptionService.getStatus(req.params.id);
  sendSuccess(res, {
    message: `Subscription granted: "${pkg.name}" (${pkg.durationDays} days).`,
    data: { subscription },
  });
});

// Admin revokes a building's subscription immediately (locks the dashboard).
const revokeSubscription = asyncHandler(async (req, res) => {
  await subscriptionService.expireSubscription(req.params.id);
  const subscription = await subscriptionService.getStatus(req.params.id);
  sendSuccess(res, { message: 'Subscription revoked.', data: { subscription } });
});

// Admin xem gói đăng ký dài hạn của building (read-only)
const LongTermPackage = require('../../models/policy/LongTermPackage');
const listBuildingPackages = asyncHandler(async (req, res) => {
  const items = await LongTermPackage.find({ building: req.params.id })
    .populate('vehicleType', 'name code')
    .sort('-createdAt');
  sendSuccess(res, { data: { items } });
});

module.exports = {
  listBuildings,
  getBuilding,
  createBuilding,
  updateBuilding,
  updateBuildingStatus,
  deleteBuilding,
  getBuildingMembers,
  listBuildingPackages,
  grantSubscription,
  revokeSubscription,
};
