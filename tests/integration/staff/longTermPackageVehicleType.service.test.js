/**
 * Gói dài hạn gắn với MỘT loại xe. Lúc vào bãi, loại xe của GÓI
 * (`subscription.package.vehicleType`) là nguồn sự thật — camera nhận diện sai
 * hoặc client gửi loại xe/slot sai nhóm KHÔNG được đẩy xe của gói xe máy vào ô ô
 * tô (và ngược lại), kể cả khi staff bật forceCheckIn.
 */
const db = require('../../helpers/db');
const f = require('../../helpers/fixtures');
const { checkIn } = require('../../../src/services/staff/parkingSession/checkIn.service');
const LongTermSubscription = require('../../../src/models/policy/LongTermSubscription');
const ParkingSession = require('../../../src/models/operations/ParkingSession');
const ParkingSlot = require('../../../src/models/building/ParkingSlot');

jest.setTimeout(120000);

const IMG = 'data:image/png;base64,AAAA';
const DAY = 24 * 60 * 60 * 1000;
const PLATE = '59X1-123.45';

let building, floor, staff, motorbikeType, carType, motorbikeSlot, carSlot;

beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });

beforeEach(async () => {
  await db.clear();
  f.resetSeq();
  building = await f.createBuilding({ operatingHours: { open: '00:00', close: '23:59' } });
  floor = await f.createFloor(building._id, { capacity: 100 });
  motorbikeType = await f.createVehicleType(building._id, { code: 'MOTORBIKE', name: 'Xe máy' });
  carType = await f.createVehicleType(building._id, { code: 'CAR', name: 'Ô tô' });
  // Cả hai ô đều thuộc dãy 'subscriber' — chỉ khác LOẠI XE.
  motorbikeSlot = await f.createSlot(building._id, floor._id, {
    code: 'M1', usageType: 'subscriber', vehicleType: motorbikeType._id,
  });
  carSlot = await f.createSlot(building._id, floor._id, {
    code: 'C1', usageType: 'subscriber', vehicleType: carType._id,
  });

  staff = await f.createUser({ role: 'staff' });
  staff.assignedBuildings = [building._id];
  const shift = await f.createShift(building._id, { startTime: '00:00', endTime: '23:59' });
  await f.createStaffShift(building._id, staff._id, shift._id);
});

const subscribeTo = async (vehicleTypeId, over = {}) => {
  const pkg = await f.createPackage(building._id, vehicleTypeId, { maxHoursPerDay: 24 });
  return LongTermSubscription.create({
    user: (await f.createUser())._id,
    package: pkg._id,
    building: building._id,
    plateNumber: PLATE,
    startDate: new Date(Date.now() - DAY),
    endDate: new Date(Date.now() + 30 * DAY),
    status: 'active',
    ...over,
  });
};

const doCheckIn = (payload = {}) => checkIn(staff, {
  building: building._id, plateNumber: PLATE, portraitImage: IMG, plateImage: IMG, ...payload,
});

describe('gói xe máy (floating)', () => {
  beforeEach(async () => { await subscribeTo(motorbikeType._id); });

  test('client gửi loại xe ô tô → 409 PACKAGE_VEHICLE_TYPE_MISMATCH, không tạo phiên', async () => {
    await expect(doCheckIn({ vehicleType: carType._id })).rejects.toMatchObject({
      statusCode: 409, errorCode: 'PACKAGE_VEHICLE_TYPE_MISMATCH',
    });

    expect(await ParkingSession.countDocuments({ plateNumber: PLATE })).toBe(0);
    expect((await ParkingSlot.findById(carSlot._id)).status).toBe('available');
  });

  test('forceCheckIn KHÔNG bỏ qua được ràng buộc loại xe của gói', async () => {
    await expect(
      doCheckIn({ vehicleType: carType._id, forceCheckIn: true, overrideReason: 'khách quen' }),
    ).rejects.toMatchObject({ statusCode: 409, errorCode: 'PACKAGE_VEHICLE_TYPE_MISMATCH' });
  });

  test('staff chọn tay ô của ô tô → 409 PACKAGE_VEHICLE_TYPE_MISMATCH', async () => {
    await expect(doCheckIn({ slot: carSlot._id })).rejects.toMatchObject({
      statusCode: 409, errorCode: 'PACKAGE_VEHICLE_TYPE_MISMATCH',
    });

    expect((await ParkingSlot.findById(carSlot._id)).status).toBe('available');
  });

  test('ô xe máy vẫn check-in bình thường, phiên mang loại xe của GÓI', async () => {
    const created = await doCheckIn({ vehicleType: motorbikeType._id });

    expect(String(created.slot)).toBe(String(motorbikeSlot._id));
    expect(String(created.vehicleType)).toBe(String(motorbikeType._id));
    expect(created.paymentMethod).toBe('long_term');
    expect((await ParkingSlot.findById(motorbikeSlot._id)).status).toBe('occupied');
    expect((await ParkingSlot.findById(carSlot._id)).status).toBe('available');
  });

  test('không gửi loại xe: tự gán theo gói, không mượn ô ô tô còn trống', async () => {
    await ParkingSlot.updateOne({ _id: motorbikeSlot._id }, { $set: { status: 'occupied' } });

    await expect(doCheckIn()).rejects.toMatchObject({
      statusCode: 409, errorCode: 'SLOT_REQUIRED_FOR_LONG_TERM',
    });

    expect((await ParkingSlot.findById(carSlot._id)).status).toBe('available');
  });
});

describe('gói ô tô (floating)', () => {
  test('staff chọn tay ô xe máy → 409 PACKAGE_VEHICLE_TYPE_MISMATCH', async () => {
    await subscribeTo(carType._id);

    await expect(doCheckIn({ slot: motorbikeSlot._id })).rejects.toMatchObject({
      statusCode: 409, errorCode: 'PACKAGE_VEHICLE_TYPE_MISMATCH',
    });
  });

  test('ô ô tô vẫn check-in bình thường', async () => {
    await subscribeTo(carType._id);

    const created = await doCheckIn({ vehicleType: carType._id, slot: carSlot._id });

    expect(String(created.slot)).toBe(String(carSlot._id));
    expect(String(created.vehicleType)).toBe(String(carType._id));
  });
});

describe('gói giữ ô cố định', () => {
  test('ô cố định đúng loại xe → check-in bình thường (giữ nguyên hành vi)', async () => {
    await ParkingSlot.updateOne({ _id: motorbikeSlot._id }, { $set: { status: 'reserved' } });
    await subscribeTo(motorbikeType._id, { slot: motorbikeSlot._id });

    const created = await doCheckIn({ vehicleType: motorbikeType._id });

    expect(String(created.slot)).toBe(String(motorbikeSlot._id));
    expect((await ParkingSlot.findById(motorbikeSlot._id)).status).toBe('occupied');
  });

  test('dữ liệu hỏng — ô cố định khác nhóm loại xe của gói → 409, không tạo phiên lệch', async () => {
    await ParkingSlot.updateOne({ _id: carSlot._id }, { $set: { status: 'reserved' } });
    await subscribeTo(motorbikeType._id, { slot: carSlot._id });

    await expect(doCheckIn({ vehicleType: motorbikeType._id })).rejects.toMatchObject({
      statusCode: 409, errorCode: 'PACKAGE_VEHICLE_TYPE_MISMATCH',
    });

    expect(await ParkingSession.countDocuments({ plateNumber: PLATE })).toBe(0);
    // Transaction rollback: ô cố định vẫn ở trạng thái giữ chỗ.
    expect((await ParkingSlot.findById(carSlot._id)).status).toBe('reserved');
  });
});
