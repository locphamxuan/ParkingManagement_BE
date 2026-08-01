/** Ràng buộc bảo vệ: không xoá/đổi loại xe khi xe đang gửi hoặc đang gắn gói dài hạn. */
const db = require('../../helpers/db');
const f = require('../../helpers/fixtures');
const vehicleService = require('../../../src/services/user/vehicle.service');
const LongTermSubscription = require('../../../src/models/policy/LongTermSubscription');
const ParkingSession = require('../../../src/models/operations/ParkingSession');

beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });
afterEach(async () => { await db.clear(); });

test('không xoá được xe đang có gói dài hạn hiệu lực', async () => {
  const user = await f.createUser();
  const vehicle = await vehicleService.add(user._id, {
    plateNumber: '51F-123.45',
    category: 'car',
  });
  const building = await f.createBuilding();
  const vehicleType = await f.createVehicleType(building._id);
  const pkg = await f.createPackage(building._id, vehicleType._id);
  await LongTermSubscription.create({
    user: user._id,
    package: pkg._id,
    building: building._id,
    plateNumber: '51F-123.45',
    startDate: new Date(Date.now() - 60_000),
    endDate: new Date(Date.now() + 86_400_000),
    status: 'active',
  });

  await expect(vehicleService.remove(user._id, vehicle._id))
    .rejects.toMatchObject({
      statusCode: 409,
      errorCode: 'VEHICLE_HAS_ACTIVE_SUBSCRIPTION',
    });
});

test('không xoá được xe đang gửi trong bãi', async () => {
  const user = await f.createUser();
  const vehicle = await vehicleService.add(user._id, { plateNumber: '51F-123.45' });
  const building = await f.createBuilding();
  await ParkingSession.create({
    user: user._id,
    building: building._id,
    plateNumber: '51F-123.45',
    status: 'active',
  });

  await expect(vehicleService.remove(user._id, vehicle._id))
    .rejects.toMatchObject({
      statusCode: 409,
      errorCode: 'VEHICLE_HAS_ACTIVE_SESSION',
    });
});

test('không đổi được thể loại xe khi xe đang gửi', async () => {
  const user = await f.createUser();
  const vehicle = await vehicleService.add(user._id, {
    plateNumber: '51F-123.45',
    category: 'car',
  });
  const building = await f.createBuilding();
  await ParkingSession.create({
    user: user._id,
    building: building._id,
    plateNumber: '51F-123.45',
    status: 'active',
  });

  // Đổi sang 'suv' chứ không phải 'motorcycle': biển 51F là biển ô tô nên khai
  // xe máy sẽ bị chặn sớm hơn bởi ràng buộc biển↔thể loại (400), che mất đúng
  // thứ test này muốn chứng minh — đang gửi xe thì không đổi được thể loại.
  await expect(
    vehicleService.update(user._id, vehicle._id, { category: 'suv' }),
  ).rejects.toMatchObject({
    statusCode: 409,
    errorCode: 'VEHICLE_CATEGORY_CONFLICT',
  });
});

test('vẫn sửa được mô tả (hãng/màu) khi xe đang gửi', async () => {
  const user = await f.createUser();
  const vehicle = await vehicleService.add(user._id, { plateNumber: '51F-123.45' });
  const building = await f.createBuilding();
  await ParkingSession.create({
    user: user._id,
    building: building._id,
    plateNumber: '51F-123.45',
    status: 'active',
  });

  const updated = await vehicleService.update(user._id, vehicle._id, { brand: 'Mazda' });
  expect(updated.brand).toBe('Mazda');
});
