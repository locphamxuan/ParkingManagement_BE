const mongoose = require('mongoose');
const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/response');
const VehicleType = require('../../models/building/VehicleType');
const Building = require('../../models/building/Building');
const Floor = require('../../models/building/Floor');
const ParkingSlot = require('../../models/building/ParkingSlot');
const AppError = require('../../utils/AppError');

/**
 * Resolve a building by ObjectId OR code string.
 */
async function resolveBuilding(buildingRef) {
  const query = mongoose.isValidObjectId(buildingRef)
    ? { _id: buildingRef }
    : { code: buildingRef.toString().toUpperCase() };
  return Building.findOne(query).select('_id code name');
}

/**
 * GET /api/users/buildings/:buildingId/vehicle-types
 */
const listVehicleTypes = asyncHandler(async (req, res) => {
  const building = await resolveBuilding(req.params.buildingId);
  if (!building) throw new AppError('Building not found', 404);

  const items = await VehicleType.find({ building: building._id, isActive: true })
    .select('_id code name description')
    .sort('code');

  sendSuccess(res, { data: { building: { _id: building._id, code: building.code, name: building.name }, items } });
});

/**
 * GET /api/users/buildings/:buildingId/floors?vehicleTypeId=<id>
 * Trả danh sách tầng + số slot available/occupied/reserved.
 */
const listFloorsWithAvailability = asyncHandler(async (req, res) => {
  const building = await resolveBuilding(req.params.buildingId);
  if (!building) throw new AppError('Building not found', 404);

  const { vehicleTypeId } = req.query;

  // Lấy tầng active, filter theo loại xe nếu có
  const floorFilter = { building: building._id, status: 'active' };
  if (vehicleTypeId && mongoose.isValidObjectId(vehicleTypeId)) {
    floorFilter.allowedVehicleTypes = vehicleTypeId;
  }

  const floors = await Floor.find(floorFilter)
    .select('_id code name levelNumber capacity allowedVehicleTypes pricePolicy status')
    .populate('allowedVehicleTypes', 'name code')
    .populate('pricePolicy', 'name hourlyRate type')
    .sort('levelNumber');

  // Đếm slots theo status cho mỗi tầng
  const floorIds = floors.map((f) => f._id);
  const slotCounts = await ParkingSlot.aggregate([
    { $match: { floor: { $in: floorIds } } },
    { $group: { _id: { floor: '$floor', status: '$status' }, count: { $sum: 1 } } },
  ]);

  // Build map floorId → { available, occupied, reserved, maintenance }
  const countMap = {};
  for (const { _id, count } of slotCounts) {
    const fid = _id.floor.toString();
    if (!countMap[fid]) countMap[fid] = { available: 0, occupied: 0, reserved: 0, maintenance: 0 };
    countMap[fid][_id.status] = count;
  }

  const result = floors.map((f) => {
    const counts = countMap[f._id.toString()] || { available: 0, occupied: 0, reserved: 0, maintenance: 0 };
    return {
      ...f.toObject(),
      availableSlots: counts.available,
      occupiedSlots: counts.occupied,
      reservedSlots: counts.reserved,
      totalSlots: counts.available + counts.occupied + counts.reserved + counts.maintenance,
    };
  });

  sendSuccess(res, { data: { building: { _id: building._id, code: building.code, name: building.name }, floors: result } });
});

/**
 * GET /api/users/buildings/:buildingId/floors/:floorId/slots
 * Trả danh sách slot với status (không trả user info).
 */
const listSlotsForFloor = asyncHandler(async (req, res) => {
  const building = await resolveBuilding(req.params.buildingId);
  if (!building) throw new AppError('Building not found', 404);

  const { floorId } = req.params;
  if (!mongoose.isValidObjectId(floorId)) throw new AppError('Invalid floorId', 400);

  const floor = await Floor.findOne({ _id: floorId, building: building._id });
  if (!floor) throw new AppError('Floor not found', 404);

  const slots = await ParkingSlot.find({ floor: floorId, building: building._id })
    .select('_id code status vehicleType reservable')
    .populate('vehicleType', 'name code')
    .sort('code');

  sendSuccess(res, { data: { floor: { _id: floor._id, name: floor.name, code: floor.code }, slots } });
});

/**
 * GET /api/users/buildings
 * Returns all active buildings for the reservation wizard.
 */
const listBuildings = asyncHandler(async (req, res) => {
  const buildings = await Building.find({ status: 'active' })
    .select('_id code name address')
    .sort('name');
  sendSuccess(res, { data: { items: buildings } });
});

module.exports = { listBuildings, listVehicleTypes, listFloorsWithAvailability, listSlotsForFloor, resolveBuilding };
