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

  // Đếm slots theo status cho mỗi tầng. Luồng mua gói (usage=subscriber) chỉ đếm ô
  // thuộc dãy 'subscriber' (+ đúng loại xe nếu có) để user thấy đúng số chỗ gói còn trống.
  const floorIds = floors.map((f) => f._id);
  const countMatch = { floor: { $in: floorIds } };
  if (req.query.usage === 'subscriber') {
    countMatch.usageType = 'subscriber';
    if (vehicleTypeId && mongoose.isValidObjectId(vehicleTypeId)) {
      countMatch.vehicleType = new mongoose.Types.ObjectId(vehicleTypeId);
    }
  }
  const slotCounts = await ParkingSlot.aggregate([
    { $match: countMatch },
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

  // Luồng MUA GÓI (usage=subscriber): chỉ hiển thị ô thuộc dãy 'subscriber' đúng loại
  // xe của gói — các ô khác KHÔNG trả về. Luồng khác: hiển thị mọi ô (trừ ô subscriber
  // không cho chọn).
  const usage = req.query.usage;
  const vehicleTypeId = req.query.vehicleTypeId;

  const slotFilter = { floor: floorId };
  if (usage === 'subscriber') {
    slotFilter.usageType = 'subscriber';
    if (vehicleTypeId && mongoose.isValidObjectId(vehicleTypeId)) {
      slotFilter.vehicleType = vehicleTypeId;
    }
  }

  // Lọc theo floor là đủ (floor đã thuộc building). KHÔNG thêm điều kiện building
  // vào slot — nếu trường building của slot bị lệch dữ liệu, danh sách sẽ rỗng dù
  // tầng vẫn đếm ra số ô. Loại xe + đối tượng của ô lấy theo DÃY (zone), denormalize sẵn.
  const slots = await ParkingSlot.find(slotFilter)
    .select('_id code status reservable vehicleType usageType')
    .populate('vehicleType', 'name code')
    .sort('code');

  const slotsOut = slots.map((s) => {
    let bookable;
    if (usage === 'subscriber') {
      // Ô dãy gói được chọn khi còn trống (giữ chỗ cố định lúc mua gói).
      bookable = s.usageType === 'subscriber' || !s.usageType;
    } else if (usage === 'visitor') {
      // Ô thuộc dãy GÓI DÀI HẠN (subscriber) KHÔNG cho khách thường đặt chỗ.
      bookable = s.usageType !== 'subscriber';
    } else {
      bookable = true;
    }
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

module.exports = { listBuildings, listVehicleTypes, listFloorsWithAvailability, listSlotsForFloor };
