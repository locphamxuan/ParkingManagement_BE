const mongoose = require('mongoose');
const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/response');
const VehicleType = require('../../models/building/VehicleType');
const Building = require('../../models/building/Building');
const Floor = require('../../models/building/Floor');
const ParkingSlot = require('../../models/building/ParkingSlot');
const LongTermSubscription = require('../../models/policy/LongTermSubscription');
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

  const floor = await Floor.findOne({ _id: floorId, building: building._id })
    .populate('allowedVehicleTypes', 'name code');
  if (!floor) throw new AppError('Floor not found', 404);

  // Lọc theo floor là đủ (floor đã thuộc building). KHÔNG thêm điều kiện building
  // vào slot — nếu trường building của slot bị lệch dữ liệu, danh sách sẽ rỗng dù
  // tầng vẫn đếm ra số ô (aggregate đếm theo floor). Đây là nguyên nhân "ô không hiện".
  const slots = await ParkingSlot.find({ floor: floorId })
    .select('_id code status reservable')
    .sort('code');

  // Loại xe của Ô ĐỖ được suy ra từ TẦNG (manager set loại xe ở tầng, không set ở ô).
  //  - tầng cho phép đúng 1 loại  → ô nhận loại đó
  //  - tầng cho phép nhiều loại    → ô nhận mọi loại (null)
  const floorVTs = floor.allowedVehicleTypes || [];
  const slotVehicleType =
    floorVTs.length === 1
      ? { _id: floorVTs[0]._id, name: floorVTs[0].name, code: floorVTs[0].code }
      : null;

  // Slot đang được một gói dài hạn giữ (active hoặc vừa hết hạn còn trong grace)
  // → hiển thị biển số + tên tài khoản chủ slot, và không cho user khác chọn.
  const slotIds = slots.map((s) => s._id);
  const holders = slotIds.length
    ? await LongTermSubscription.find({
        slot: { $in: slotIds },
        slotReleased: false,
        status: { $in: ['active', 'expired'] },
      })
        .select('slot plateNumber user')
        .populate('user', 'fullName')
    : [];
  const ownerBySlot = new Map(
    holders.map((h) => [
      String(h.slot),
      { plateNumber: h.plateNumber, accountName: h.user?.fullName || null },
    ]),
  );

  const slotsOut = slots.map((s) => {
    const owner = ownerBySlot.get(String(s._id)) || null;
    return {
      _id: s._id,
      code: s.code,
      status: s.status,
      reservable: s.reservable,
      vehicleType: slotVehicleType,
      // Chỉ chọn được slot còn trống (available) và không bị gói nào giữ.
      selectable: s.status === 'available' && !owner,
      owner, // { plateNumber, accountName } nếu đang bị một gói giữ, ngược lại null
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
