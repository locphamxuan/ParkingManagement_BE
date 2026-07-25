const db = require('../../helpers/db');
const f = require('../../helpers/fixtures');
const queryService = require('../../../src/services/staff/parkingSession/query.service');
const ParkingSession = require('../../../src/models/operations/ParkingSession');

let building;
let otherBuilding;
let staff;

beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.clear();
  building = await f.createBuilding();
  otherBuilding = await f.createBuilding();
  staff = await f.createUser({ role: 'staff' });
  staff.assignedBuildings = [building._id];
});

test('lookup requires building and never leaks contact or wallet fields', async () => {
  await f.createUser({
    fullName: 'Plate Owner',
    walletBalance: 900000,
    phone: '0900000000',
    licensePlates: [{ plateNumber: '51F-123.45', vehicleType: 'car' }],
  });

  await expect(queryService.lookupPlate(staff, '51F-123.45'))
    .rejects.toMatchObject({ statusCode: 400, errorCode: 'BUILDING_REQUIRED' });

  const result = await queryService.lookupPlate(staff, '51F-123.45', building._id);

  expect(result.user).toMatchObject({ fullName: 'Plate Owner' });
  expect(result.user).not.toHaveProperty('email');
  expect(result.user).not.toHaveProperty('phone');
  expect(result.user).not.toHaveProperty('walletBalance');
});

test('lookup scopes active session to the selected building', async () => {
  await f.createUser({
    licensePlates: [{ plateNumber: '51F-123.45', vehicleType: 'car' }],
  });
  await ParkingSession.create({
    building: otherBuilding._id,
    plateNumber: '51F-123.45',
    status: 'active',
  });

  const result = await queryService.lookupPlate(staff, '51F-123.45', building._id);

  expect(result.activeSession).toBeNull();
});

test('lookup and reject deny another building', async () => {
  await expect(queryService.lookupPlate(staff, '51F-123.45', otherBuilding._id))
    .rejects.toMatchObject({
      statusCode: 403,
      errorCode: 'FORBIDDEN_BUILDING_SCOPE',
    });

  await expect(queryService.rejectEntry(staff, {
    plateNumber: '51F-123.45',
    stage: 'check-in',
    reason: 'Mismatch',
    building: otherBuilding._id,
  })).rejects.toMatchObject({
    statusCode: 403,
    errorCode: 'FORBIDDEN_BUILDING_SCOPE',
  });
});

test('checkout rejection requires an active same-building session', async () => {
  const shift = await f.createShift(building._id);
  await f.createStaffShift(building._id, staff._id, shift._id);

  await expect(queryService.rejectEntry(staff, {
    plateNumber: '51F-123.45',
    stage: 'check-out',
    reason: 'Plate mismatch',
    building: building._id,
  })).rejects.toMatchObject({
    statusCode: 409,
    errorCode: 'ACTIVE_SESSION_NOT_FOUND',
  });
});

test('session search sorts newest first with a stable _id tie-breaker', async () => {
  const entryTime = new Date('2026-07-25T03:00:00.000Z');
  const olderId = '64b000000000000000000001';
  const newerId = '64b000000000000000000002';
  await ParkingSession.create([
    {
      _id: olderId,
      building: building._id,
      plateNumber: '51F-123.45',
      status: 'completed',
      entryTime,
    },
    {
      _id: newerId,
      building: building._id,
      plateNumber: '51F-123.45',
      status: 'completed',
      entryTime,
    },
  ]);

  const result = await queryService.search(staff, '51F', { building: building._id });

  expect(result.map((session) => String(session._id))).toEqual([newerId, olderId]);
});
