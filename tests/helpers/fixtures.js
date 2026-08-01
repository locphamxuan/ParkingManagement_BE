/**
 * Factory tạo dữ liệu mẫu cho integration test. Mỗi hàm nhận `over` để ghi đè.
 * Dùng bộ đếm để đảm bảo code/email duy nhất giữa các lần gọi trong 1 test.
 */
const User = require('../../src/models/user/User');
const Vehicle = require('../../src/models/vehicle/Vehicle');
const Building = require('../../src/models/building/Building');
const VehicleType = require('../../src/models/building/VehicleType');
const Floor = require('../../src/models/building/Floor');
const Zone = require('../../src/models/building/Zone');
const ParkingSlot = require('../../src/models/building/ParkingSlot');
const RefundPolicy = require('../../src/models/policy/RefundPolicy');
const PricePolicy = require('../../src/models/policy/PricePolicy');
const LongTermPackage = require('../../src/models/policy/LongTermPackage');
const Shift = require('../../src/models/operations/Shift');
const StaffShift = require('../../src/models/operations/StaffShift');
const Gate = require('../../src/models/building/Gate');

let seq = 0;
const next = () => (seq += 1);
const resetSeq = () => { seq = 0; };

/**
 * Tạo user; `over.vehicles` (nếu có) sẽ được tạo trong collection Vehicle rồi gắn
 * vào thuộc tính `vehicles` của document trả về — thuộc tính này KHÔNG được lưu,
 * chỉ để test lấy nhanh qrCode/_id mà không phải query lại.
 */
const createUser = async (over = {}) => {
  const n = next();
  const user = await User.create({
    email: over.email || `user${n}@test.com`,
    password: over.password || 'secret1',
    fullName: over.fullName || `User ${n}`,
    role: over.role || 'user',
    walletBalance: over.walletBalance ?? 0,
    ...(over.phone ? { phone: over.phone } : {}),
  });

  const vehicles = over.vehicles
    ? await Promise.all(
        over.vehicles.map((v, index) => createVehicle(user._id, { isDefault: index === 0, ...v }))
      )
    : [];
  // defineProperty chứ không gán thẳng: Mongoose bỏ qua mọi assignment vào path
  // không có trong schema, nên `user.vehicles = ...` sẽ im lặng biến mất.
  Object.defineProperty(user, 'vehicles', { value: vehicles, enumerable: false });
  return user;
};

const createVehicle = (ownerId, over = {}) =>
  Vehicle.create({
    owner: ownerId,
    plateNumber: over.plateNumber,
    category: over.category || 'car',
    brand: over.brand ?? null,
    isDefault: over.isDefault ?? false,
    qrIssuedAt: new Date(),
    // Mặc định cấp mã còn hạn; test hạn QR truyền qrExpiresAt trong quá khứ.
    qrExpiresAt: over.qrExpiresAt ?? new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    ...(over.qrCode ? { qrCode: over.qrCode } : {}),
  });

const createBuilding = (over = {}) => {
  const n = next();
  return Building.create({
    name: over.name || `Building ${n}`,
    code: over.code || `BLD${n}`,
    totalFloors: over.totalFloors ?? 3,
    pricing: over.pricing || { hourlyRate: 10000 },
    operatingHours: over.operatingHours || { open: '00:00', close: '23:59' },
    ...(over.manager ? { manager: over.manager } : {}),
    ...(over.status ? { status: over.status } : {}),
  });
};

// category = thể loại xe chuẩn dùng cho điều kiện mua gói (constants/vehicle).
// Mặc định 'car' để các fixture cũ vẫn mua được gói; test nào cần kiểm tra ràng buộc
// loại xe thì truyền tường minh ('suv', 'motorcycle', null = chưa map, ...).
/**
 * Suy thể loại xe từ code/name CHỈ để dựng dữ liệu test cho gọn — production đọc
 * thẳng `VehicleType.category`, không đoán. Test nào quan tâm tới category thì
 * truyền thẳng (kể cả `null` để dựng danh mục chưa map).
 */
const guessCategory = (over = {}) => {
  const s = `${over.code || ''} ${over.name || ''}`.toLowerCase();
  if (/motor|xe m|máy|bike|moto/.test(s)) return 'motorcycle';
  return 'car';
};

const createVehicleType = (buildingId, over = {}) => {
  const n = next();
  return VehicleType.create({
    building: buildingId,
    code: over.code || `VT${n}`,
    name: over.name || `Vehicle ${n}`,
    category: over.category !== undefined ? over.category : guessCategory(over),
    isActive: over.isActive ?? true,
  });
};

const createFloor = (buildingId, over = {}) => {
  const n = next();
  return Floor.create({
    building: buildingId,
    code: over.code || `F${n}`,
    name: over.name || `Floor ${n}`,
    capacity: over.capacity ?? 100,
    ...(over.allowedVehicleTypes ? { allowedVehicleTypes: over.allowedVehicleTypes } : {}),
  });
};

const createZone = (buildingId, floorId, vehicleTypeId, over = {}) => {
  const n = next();
  return Zone.create({
    building: buildingId,
    floor: floorId,
    vehicleType: vehicleTypeId,
    code: over.code || `Z${n}`,
    usageType: over.usageType || 'walk_in',
    capacity: over.capacity ?? 10,
  });
};

const createSlot = (buildingId, floorId, over = {}) => {
  const n = next();
  return ParkingSlot.create({
    building: buildingId,
    floor: floorId,
    code: over.code || `S${n}`,
    status: over.status || 'available',
    reservable: over.reservable ?? true,
    ...(over.zone ? { zone: over.zone } : {}),
    ...(over.vehicleType ? { vehicleType: over.vehicleType } : {}),
    ...(over.usageType ? { usageType: over.usageType } : {}),
  });
};

// Chính sách hoàn tiền gói (model giữ tên RefundPolicy sau khi bỏ đặt chỗ).
const createRefundPolicy = (buildingId, over = {}) =>
  RefundPolicy.create({
    building: buildingId,
    refundPercent: over.refundPercent ?? 80,
  });

const createPricePolicy = (buildingId, vehicleTypeId, over = {}) => {
  const n = next();
  return PricePolicy.create({
    building: buildingId,
    vehicleType: vehicleTypeId,
    name: over.name || `Price ${n}`,
    hourlyRate: over.hourlyRate ?? 10000,
    type: over.type || 'regular',
    ...(over.timeWindow ? { timeWindow: over.timeWindow } : {}),
    isActive: over.isActive ?? true,
  });
};

const createPackage = (buildingId, vehicleTypeId, over = {}) => {
  const n = next();
  return LongTermPackage.create({
    building: buildingId,
    vehicleType: vehicleTypeId,
    name: over.name || `Package ${n}`,
    code: over.code || `PKG${n}`,
    durationDays: over.durationDays ?? 30,
    price: over.price ?? 500000,
    maxHoursPerDay: over.maxHoursPerDay ?? 0,
    isActive: over.isActive ?? true,
  });
};

const createShift = (buildingId, over = {}) => {
  const n = next();
  return Shift.create({
    building: buildingId,
    name: over.name || `Shift ${n}`,
    code: over.code || `SH${n}`,
    startTime: over.startTime || '00:00',
    endTime: over.endTime || '23:59',
    isActive: over.isActive ?? true,
  });
};

const createStaffShift = (buildingId, staffId, shiftId, over = {}) => {
  // businessTime derives the business date from this instant. Keeping the
  // current instant avoids using the test runner's local calendar date, which
  // can differ from the configured business timezone around midnight.
  const workDate = over.workDate ?? new Date();
  return StaffShift.create({
    building: buildingId,
    staff: staffId,
    shift: shiftId,
    workDate,
    status: over.status || 'active',
    ...(over.gate ? { gate: over.gate } : {}),
  });
};

const createGate = (buildingId, over = {}) => {
  const n = next();
  return Gate.create({
    building: buildingId,
    code: over.code || `G${n}`,
    name: over.name || `Gate ${n}`,
    direction: over.direction || 'both',
    status: over.status || 'active',
  });
};

// Tạo user role=manager với assignedBuildings đã gán (in-memory) để qua
// ensureManagerOwnsBuilding trong các service manager. Không cần lưu assignedBuildings.
const managerFor = async (buildingIds, over = {}) => {
  const ids = Array.isArray(buildingIds) ? buildingIds : [buildingIds];
  const manager = await createUser({ role: 'manager', ...over });
  manager.assignedBuildings = ids;
  return manager;
};

module.exports = {
  resetSeq,
  managerFor,
  createUser,
  createVehicle,
  createBuilding,
  createVehicleType,
  createFloor,
  createZone,
  createSlot,
  createRefundPolicy,
  createPricePolicy,
  createPackage,
  createShift,
  createStaffShift,
  createGate,
};
