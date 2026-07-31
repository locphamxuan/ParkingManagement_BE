/**
 * `resolveVehicleTypeId` turns the 'car' | 'motorcycle' string the gate clients
 * send into a building's VehicleType, and the rest of check-in reads that record
 * back with `vehicleKindFromType`. If the two ever disagree, a long-term package
 * is rejected with PACKAGE_VEHICLE_TYPE_MISMATCH even though the request was
 * correct — so they are pinned together here.
 */
const db = require('../../helpers/db');
const f = require('../../helpers/fixtures');
const {
  resolveVehicleTypeId,
  vehicleKindFromType,
} = require('../../../src/services/staff/parkingSession/helpers');
const VehicleType = require('../../../src/models/building/VehicleType');

beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => { await db.clear(); f.resetSeq(); });

describe('resolveVehicleTypeId', () => {
  test('resolves "car" to the car type even when Motorcycle was created first', async () => {
    // Insertion order matters: the old implementation took the first document a
    // name regex matched, and "M-OTO-rcycle" matched its /oto/ car branch.
    const building = await f.createBuilding();
    const motorcycle = await f.createVehicleType(building._id, { code: 'MOTORCYCLE', name: 'Motorcycle' });
    const car = await f.createVehicleType(building._id, { code: 'CAR', name: 'Car' });

    const resolved = await resolveVehicleTypeId(building._id, 'car');

    expect(String(resolved)).toBe(String(car._id));
    expect(String(resolved)).not.toBe(String(motorcycle._id));
  });

  test('resolves "motorcycle" to the motorcycle type', async () => {
    const building = await f.createBuilding();
    await f.createVehicleType(building._id, { code: 'CAR', name: 'Car' });
    const motorcycle = await f.createVehicleType(building._id, { code: 'MOTORCYCLE', name: 'Motorcycle' });

    const resolved = await resolveVehicleTypeId(building._id, 'motorcycle');

    expect(String(resolved)).toBe(String(motorcycle._id));
  });

  test.each(['car', 'motorcycle'])(
    'a resolved "%s" type reads back as the same kind downstream',
    async (kind) => {
      const building = await f.createBuilding();
      await f.createVehicleType(building._id, { code: 'MOTORCYCLE', name: 'Motorcycle' });
      await f.createVehicleType(building._id, { code: 'CAR', name: 'Car' });

      const resolved = await resolveVehicleTypeId(building._id, kind);
      const record = await VehicleType.findById(resolved);

      expect(vehicleKindFromType(record)).toBe(kind);
    },
  );

  test('passes an ObjectId straight through', async () => {
    const building = await f.createBuilding();
    const car = await f.createVehicleType(building._id, { code: 'CAR', name: 'Car' });

    expect(await resolveVehicleTypeId(building._id, car._id)).toBe(car._id);
  });

  test('returns null when the building has no matching type', async () => {
    const building = await f.createBuilding();
    await f.createVehicleType(building._id, { code: 'MOTORCYCLE', name: 'Motorcycle' });

    expect(await resolveVehicleTypeId(building._id, 'car')).toBeNull();
  });

  test('never borrows a type from another building', async () => {
    const building = await f.createBuilding();
    const other = await f.createBuilding();
    await f.createVehicleType(other._id, { code: 'CAR', name: 'Car' });

    expect(await resolveVehicleTypeId(building._id, 'car')).toBeNull();
  });
});
