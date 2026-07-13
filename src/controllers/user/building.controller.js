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

  // Lấy tầng active, filter theo loại xe nếu có.
  // allowedVehicleTypes rỗng/không cấu hình ⇒ tầng nhận MỌI loại xe (không giới hạn),
  // nên vẫn phải bao gồm các tầng này — nếu không, building có tầng vẫn ra rỗng.
  const floorFilter = { building: building._id, status: 'active' };
  if (vehicleTypeId && mongoose.isValidObjectId(vehicleTypeId)) {
    floorFilter.$or = [
      { allowedVehicleTypes: vehicleTypeId },
      { allowedVehicleTypes: { $size: 0 } },
      { allowedVehicleTypes: { $exists: false } },
    ];
  }

  const floors = await Floor.find(floorFilter)
    .select('_id code name capacity allowedVehicleTypes pricePolicy status')
    .populate('allowedVehicleTypes', 'name code')
    .populate('pricePolicy', 'name hourlyRate type')
    .sort('code');

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

  // Lọc theo floor là đủ (floor đã thuộc building). KHÔNG thêm điều kiện building
  // vào slot — nếu trường building của slot bị lệch dữ liệu, danh sách sẽ rỗng dù
  // tầng vẫn đếm ra số ô (aggregate đếm theo floor). Đây là nguyên nhân "ô không hiện".
  // Loại xe + đối tượng của ô đỗ lấy theo DÃY (zone), denormalize sẵn trên slot.
  const slots = await ParkingSlot.find({ floor: floorId })
    .select('_id code status reservable vehicleType usageType')
    .populate('vehicleType', 'name code')
    .sort('code');

  const slotsOut = slots.map((s) => {
    // Ô thuộc dãy GÓI DÀI HẠN (subscriber) KHÔNG cho khách đặt chỗ — chỉ dành cho gói.
    const bookable = s.usageType !== 'subscriber';
    return {
      _id: s._id,
      code: s.code,
      status: s.status,
      reservable: Boolean(s.reservable) && bookable,
      vehicleType: s.vehicleType
        ? { _id: s.vehicleType._id, name: s.vehicleType.name, code: s.vehicleType.code }
        : null,
      usageType: s.usageType || null,
      selectable: s.status === 'available' && Boolean(s.reservable) && bookable,
      owner: null,
    };
  });

  sendSuccess(res, {
    data: { floor: { _id: floor._id, name: floor.name, code: floor.code }, slots: slotsOut },
  });
});

/**
 * GET /api/users/buildings
 * Returns all active buildings for the reservation wizard.
 */
const listBuildings = asyncHandler(async (req, res) => {
  // operatingHours + status cho phép FE hiển thị "đang mở / đang đóng cửa".
  const buildings = await Building.find({ status: 'active' })
    .select('_id code name address operatingHours status')
    .sort('name');
  sendSuccess(res, { data: { items: buildings } });
});

module.exports = { listBuildings, listVehicleTypes, listFloorsWithAvailability, listSlotsForFloor, resolveBuilding };
