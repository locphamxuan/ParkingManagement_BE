/**
 * Staff QR lookups (Camera 2) must be scoped to the ONE building the staff member
 * currently has selected, and must never leak customer PII to the gate screen.
 */
const db = require('../../helpers/db');
const f = require('../../helpers/fixtures');
const usersService = require('../../../src/services/staff/users.service');
const ParkingSession = require('../../../src/models/operations/ParkingSession');
const LongTermSubscription = require('../../../src/models/policy/LongTermSubscription');

const PLATE_A = '51F-123.45';
const PLATE_B = '51F-678.90';
const PLATE_QR = 'PLT-TESTTOKEN01';

let buildingA;
let buildingB;
let staff;
let customer;

beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.clear();
  buildingA = await f.createBuilding();
  buildingB = await f.createBuilding();
  staff = await f.createUser({ role: 'staff' });
  // Staff chỉ được phân công tòa A.
  staff.assignedBuildings = [buildingA._id];
  customer = await f.createUser({
    fullName: 'QR Customer',
    phone: '0900000000',
    walletBalance: 750000,
    licensePlates: [
      { plateNumber: PLATE_A, vehicleType: 'car', brand: 'Toyota', qrCode: PLATE_QR },
      { plateNumber: PLATE_B, vehicleType: 'motorcycle' },
    ],
  });
});

const seedBothBuildings = async () => {
  const vehicleType = await f.createVehicleType(buildingA._id);
  const pkgA = await f.createPackage(buildingA._id, vehicleType._id);
  const pkgB = await f.createPackage(buildingB._id, vehicleType._id);
  const now = new Date();
  const startDate = new Date(now.getTime() - 24 * 3600 * 1000);
  const endDate = new Date(now.getTime() + 30 * 24 * 3600 * 1000);

  await ParkingSession.create([
    { building: buildingA._id, user: customer._id, plateNumber: PLATE_A, status: 'active', fee: 15000 },
    { building: buildingB._id, user: customer._id, plateNumber: PLATE_B, status: 'active', fee: 99000 },
  ]);
  await LongTermSubscription.create([
    { user: customer._id, package: pkgA._id, building: buildingA._id, plateNumber: PLATE_A, startDate, endDate },
    { user: customer._id, package: pkgB._id, building: buildingB._id, plateNumber: PLATE_B, startDate, endDate },
  ]);
};

describe('building is mandatory on every staff QR lookup', () => {
  test('lookupQr rejects a missing building', async () => {
    await expect(usersService.lookupQr(staff, String(customer._id)))
      .rejects.toMatchObject({ statusCode: 400, errorCode: 'BUILDING_REQUIRED' });
  });

  test('lookupPlateQr rejects a missing building', async () => {
    await expect(usersService.lookupPlateQr(staff, PLATE_QR))
      .rejects.toMatchObject({ statusCode: 400, errorCode: 'BUILDING_REQUIRED' });
  });

  test('resolveQr rejects a missing building for both account and plate tokens', async () => {
    await expect(usersService.resolveQr(staff, String(customer._id)))
      .rejects.toMatchObject({ statusCode: 400, errorCode: 'BUILDING_REQUIRED' });
    await expect(usersService.resolveQr(staff, PLATE_QR))
      .rejects.toMatchObject({ statusCode: 400, errorCode: 'BUILDING_REQUIRED' });
  });
});

describe('building outside the staff assignment is refused', () => {
  test('lookupQr denies an unassigned building', async () => {
    await expect(usersService.lookupQr(staff, String(customer._id), buildingB._id))
      .rejects.toMatchObject({ statusCode: 403, errorCode: 'FORBIDDEN_BUILDING_SCOPE' });
  });

  test('lookupPlateQr denies an unassigned building', async () => {
    await expect(usersService.lookupPlateQr(staff, PLATE_QR, buildingB._id))
      .rejects.toMatchObject({ statusCode: 403, errorCode: 'FORBIDDEN_BUILDING_SCOPE' });
  });

  test('resolveQr denies an unassigned building', async () => {
    await expect(usersService.resolveQr(staff, PLATE_QR, buildingB._id))
      .rejects.toMatchObject({ statusCode: 403, errorCode: 'FORBIDDEN_BUILDING_SCOPE' });
  });

  test('staff with no assigned building at all is refused', async () => {
    const orphan = await f.createUser({ role: 'staff' });
    await expect(usersService.resolveQr(orphan, String(customer._id), buildingA._id))
      .rejects.toMatchObject({ statusCode: 403, errorCode: 'FORBIDDEN_BUILDING_SCOPE' });
  });
});

describe('data is scoped to the exact selected building', () => {
  test('account QR returns only the selected building sessions and packages', async () => {
    await seedBothBuildings();

    const result = await usersService.lookupQr(staff, String(customer._id), buildingA._id);

    expect(result.activeSessions.map((s) => s.plateNumber)).toEqual([PLATE_A]);
    expect(result.activePackages.map((p) => p.plateNumber)).toEqual([PLATE_A]);
  });

  test('plate QR returns only the selected building sessions', async () => {
    await seedBothBuildings();

    const result = await usersService.lookupPlateQr(staff, PLATE_QR, buildingA._id);

    expect(result.found).toBe(true);
    expect(result.plate).toEqual({ plateNumber: PLATE_A, vehicleType: 'car', brand: 'Toyota' });
    expect(result.activeSessions.map((s) => s.plateNumber)).toEqual([PLATE_A]);
  });

  test('a PLT- token routed through resolveQr uses the supplied building, not every assigned one', async () => {
    // Staff được phân công CẢ HAI tòa, nhưng chỉ chọn tòa A → không được thấy phiên tòa B.
    staff.assignedBuildings = [buildingA._id, buildingB._id];
    await seedBothBuildings();

    const result = await usersService.resolveQr(staff, PLATE_QR, buildingA._id);

    expect(result.kind).toBe('plate');
    expect(result.activeSessions.map((s) => s.plateNumber)).toEqual([PLATE_A]);
  });

  test('an account QR routed through resolveQr uses the supplied building', async () => {
    staff.assignedBuildings = [buildingA._id, buildingB._id];
    await seedBothBuildings();

    const result = await usersService.resolveQr(staff, String(customer._id), buildingB._id);

    expect(result.kind).toBe('user');
    expect(result.activeSessions.map((s) => s.plateNumber)).toEqual([PLATE_B]);
    expect(result.activePackages.map((p) => p.plateNumber)).toEqual([PLATE_B]);
  });
});

describe('QR responses are minimized — no customer PII', () => {
  const PII = ['email', 'phone', 'walletBalance', 'licensePlates'];
  const assertNoPii = (payload) => {
    const serialized = JSON.stringify(payload);
    PII.forEach((field) => expect(serialized).not.toContain(field));
    expect(serialized).not.toContain('0900000000');
    expect(serialized).not.toContain('750000');
    // Biển số KHÁC (chưa quét, khác tòa) không được lộ.
    expect(serialized).not.toContain(PLATE_B);
  };

  test('account QR omits contact, wallet and plate list', async () => {
    await seedBothBuildings();

    const result = await usersService.lookupQr(staff, String(customer._id), buildingA._id);

    expect(result.user).toMatchObject({ fullName: 'QR Customer' });
    PII.forEach((field) => expect(result.user).not.toHaveProperty(field));
    assertNoPii(result);
  });

  test('plate QR omits the owner identity entirely', async () => {
    await seedBothBuildings();

    const result = await usersService.lookupPlateQr(staff, PLATE_QR, buildingA._id);

    expect(result).not.toHaveProperty('user');
    assertNoPii(result);
  });

  test('resolveQr responses stay minimized on both branches', async () => {
    await seedBothBuildings();

    assertNoPii(await usersService.resolveQr(staff, PLATE_QR, buildingA._id));
    assertNoPii(await usersService.resolveQr(staff, String(customer._id), buildingA._id));
  });

  test('an unknown account QR still reports a scoped empty result', async () => {
    const unknownId = '64b000000000000000000009';

    const result = await usersService.lookupQr(staff, unknownId, buildingA._id);

    expect(result).toEqual({
      userId: unknownId,
      hasAccount: false,
      user: null,
      activeSessions: [],
      activePackages: [],
    });
  });
});
