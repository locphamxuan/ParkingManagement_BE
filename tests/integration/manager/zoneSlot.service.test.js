/** manager: zone + slot — ngân sách sức chứa, denormalize loại xe/đối tượng. */
const db = require('../../helpers/db');
const f = require('../../helpers/fixtures');
const zoneSvc = require('../../../src/services/manager/zone.service');
const slotSvc = require('../../../src/services/manager/slot.service');

let building, manager, vt, floor;
beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.clear();
  building = await f.createBuilding();
  manager = await f.managerFor(building._id);
  vt = await f.createVehicleType(building._id);
  floor = await f.createFloor(building._id, { capacity: 10 });
});

describe('zone.service', () => {
  test('create zone hợp lệ', async () => {
    const z = await zoneSvc.create(manager, building._id, {
      floor: floor._id, code: 'Z1', vehicleType: vt._id, usageType: 'walk_in', capacity: 5,
    });
    expect(z.usageType).toBe('walk_in');
    expect(z.capacity).toBe(5);
  });

  test('tổng capacity zone vượt floor → 409 ZONE_CAPACITY_EXCEEDS_FLOOR', async () => {
    await zoneSvc.create(manager, building._id, {
      floor: floor._id, code: 'Z1', vehicleType: vt._id, usageType: 'walk_in', capacity: 8,
    });
    await expect(zoneSvc.create(manager, building._id, {
      floor: floor._id, code: 'Z2', vehicleType: vt._id, usageType: 'reserved', capacity: 5,
    })).rejects.toMatchObject({ errorCode: 'ZONE_CAPACITY_EXCEEDS_FLOOR' });
  });

  test('loại xe không nằm trong allowedVehicleTypes của tầng → 400', async () => {
    const vtOther = await f.createVehicleType(building._id);
    const fl = await f.createFloor(building._id, { capacity: 10, allowedVehicleTypes: [vtOther._id] });
    await expect(zoneSvc.create(manager, building._id, {
      floor: fl._id, code: 'ZX', vehicleType: vt._id, usageType: 'walk_in', capacity: 3,
    })).rejects.toMatchObject({ errorCode: 'VEHICLE_TYPE_NOT_ALLOWED_ON_FLOOR' });
  });
});

describe('slot.service', () => {
  test('create slot denormalize vehicleType + usageType từ zone', async () => {
    const z = await zoneSvc.create(manager, building._id, {
      floor: floor._id, code: 'Z1', vehicleType: vt._id, usageType: 'subscriber', capacity: 2,
    });
    const slot = await slotSvc.create(manager, building._id, { floor: floor._id, zone: z._id, code: 'S1' });
    expect(String(slot.vehicleType)).toBe(String(vt._id));
    expect(slot.usageType).toBe('subscriber');
  });

  test('vượt sức chứa dãy → 409 ZONE_CAPACITY_REACHED', async () => {
    const z = await zoneSvc.create(manager, building._id, {
      floor: floor._id, code: 'Z1', vehicleType: vt._id, usageType: 'walk_in', capacity: 1,
    });
    await slotSvc.create(manager, building._id, { floor: floor._id, zone: z._id, code: 'S1' });
    await expect(slotSvc.create(manager, building._id, { floor: floor._id, zone: z._id, code: 'S2' }))
      .rejects.toMatchObject({ errorCode: 'ZONE_CAPACITY_REACHED' });
  });

  test('xóa slot đang occupied → 409', async () => {
    const z = await zoneSvc.create(manager, building._id, {
      floor: floor._id, code: 'Z1', vehicleType: vt._id, usageType: 'walk_in', capacity: 3,
    });
    const slot = await slotSvc.create(manager, building._id, { floor: floor._id, zone: z._id, code: 'S1' });
    await slotSvc.update(manager, building._id, slot._id, { status: 'occupied' });
    await expect(slotSvc.remove(manager, building._id, slot._id))
      .rejects.toMatchObject({ statusCode: 409 });
  });
});
