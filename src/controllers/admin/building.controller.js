const asyncHandler = require("../../utils/asyncHandler");
const { sendSuccess } = require("../../utils/response");
const buildingService = require("../../services/building.service");
const buildingManagerService = require("../../services/buildingManager.service");
const gateService = require("../../services/manager/gate.service");
const LongTermPackage = require('../../models/policy/LongTermPackage');
const { writeAuditLog } = require('../../utils/audit');

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
  const building = await buildingService.removeBuilding(req.params.id);
  await writeAuditLog({
    actor: req.user,
    action: 'ARCHIVE_BUILDING',
    targetTable: 'buildings',
    targetId: building._id,
    building: building._id,
    newValue: { status: building.status, isActive: building.isActive },
    severity: 'high',
    description: 'Building archived; operational and financial history retained.',
  });
  sendSuccess(res, {
    message: "Building archived successfully",
    data: { building },
  });
});

const getBuildingMembers = asyncHandler(async (req, res) => {
  const members = await buildingManagerService.getBuildingMembers(req.params.id);
  sendSuccess(res, { data: { ...members } });
});

// Admin xem gói đăng ký dài hạn của building (read-only)
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
};
