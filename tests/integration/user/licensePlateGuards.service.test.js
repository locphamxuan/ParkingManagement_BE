const db = require('../../helpers/db');
const f = require('../../helpers/fixtures');
const licensePlateService = require('../../../src/services/user/licensePlate.service');
const LongTermSubscription = require('../../../src/models/policy/LongTermSubscription');
const ParkingSession = require('../../../src/models/operations/ParkingSession');

beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });
afterEach(async () => { await db.clear(); });

test('cannot remove a plate with an active subscription', async () => {
  const user = await f.createUser();
  const plates = await licensePlateService.add(user._id, {
    plateNumber: '51F-123.45',
    vehicleType: 'car',
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

  await expect(licensePlateService.remove(user._id, plates[0]._id))
    .rejects.toMatchObject({
      statusCode: 409,
      errorCode: 'PLATE_HAS_ACTIVE_SUBSCRIPTION',
    });
});

test('cannot change vehicle type while the plate has an active session', async () => {
  const user = await f.createUser();
  const plates = await licensePlateService.add(user._id, {
    plateNumber: '51F-123.45',
    vehicleType: 'car',
  });
  const building = await f.createBuilding();
  await ParkingSession.create({
    user: user._id,
    building: building._id,
    plateNumber: '51F-123.45',
    status: 'active',
  });

  await expect(
    licensePlateService.update(user._id, plates[0]._id, { vehicleType: 'motorcycle' }),
  ).rejects.toMatchObject({
    statusCode: 409,
    errorCode: 'VEHICLE_TYPE_CONFLICT',
  });
});
