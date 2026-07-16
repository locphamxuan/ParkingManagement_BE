/** manager: zone + slot — ngân sách sức chứa, denormalize loại xe/đối tượng, sinh mã tự động. */
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
  test('create zone: code sinh từ tên (bỏ từ phụ), trùng thì thêm số đuôi', async () => {
    const z = await zoneSvc.create(manager, building._id, {
      floor: floor._id, name: 'Dãy cho khách vãng lai', vehicleType: vt._id, usageType: 'walk_in', capacity: 3,
    });
    expect(z.code).toBe('VL');
    expect(z.name).toBe('Dãy cho khách vãng lai');
    expect(z.usageType).toBe('walk_in');

    const z2 = await zoneSvc.create(manager, building._id, {
      floor: floor._id, name: 'Dãy cho khách vãng lai', vehicleType: vt._id, usageType: 'walk_in', capacity: 2,
    });
    expect(z2.code).toBe('VL2');
  });

  test('tổng capacity zone vượt floor → 409 ZONE_CAPACITY_EXCEEDS_FLOOR', async () => {
    await zoneSvc.create(manager, building._id, {
      floor: floor._id, name: 'Dãy A', vehicleType: vt._id, usageType: 'walk_in', capacity: 8,
    });
    await expect(zoneSvc.create(manager, building._id, {
      floor: floor._id, name: 'Dãy B', vehicleType: vt._id, usageType: 'walk_in', capacity: 5,
    })).rejects.toMatchObject({ errorCode: 'ZONE_CAPACITY_EXCEEDS_FLOOR' });
  });

  test('loại xe không nằm trong allowedVehicleTypes của tầng → 400', async () => {
    const vtOther = await f.createVehicleType(building._id);
    const fl = await f.createFloor(building._id, { capacity: 10, allowedVehicleTypes: [vtOther._id] });
    await expect(zoneSvc.create(manager, building._id, {
      floor: fl._id, name: 'Dãy X', vehicleType: vt._id, usageType: 'walk_in', capacity: 3,
    })).rejects.toMatchObject({ errorCode: 'VEHICLE_TYPE_NOT_ALLOWED_ON_FLOOR' });
  });
});

describe('slot.service', () => {
  test('create slot không truyền code → sinh {zoneCode}-NN; denormalize vehicleType + usageType', async () => {
    const z = await zoneSvc.create(manager, building._id, {
      floor: floor._id, name: 'Dãy khách có package', vehicleType: vt._id, usageType: 'subscriber', capacity: 2,
    });
    expect(z.code).toBe('PA');
    const slot = await slotSvc.create(manager, building._id, { floor: floor._id, zone: z._id });
    expect(slot.code).toBe('PA-01');
    expect(String(slot.vehicleType)).toBe(String(vt._id));
    expect(slot.usageType).toBe('subscriber');
  });

  test('createMany: sinh mã nối tiếp theo zone trong 1 lô', async () => {
    const z = await zoneSvc.create(manager, building._id, {
      floor: floor._id, name: 'Dãy cho khách vãng lai', vehicleType: vt._id, usageType: 'walk_in', capacity: 8,
    });
    const batch1 = await slotSvc.createMany(manager, building._id, {
      floor: floor._id, zone: z._id, quantity: 3,
    });
    expect(batch1.map((s) => s.code)).toEqual(['VL-01', 'VL-02', 'VL-03']);

    const batch2 = await slotSvc.createMany(manager, building._id, {
      floor: floor._id, zone: z._id, quantity: 2,
    });
    expect(batch2.map((s) => s.code)).toEqual(['VL-04', 'VL-05']);
  });

  test('createMany vượt sức chứa dãy → 409 ZONE_CAPACITY_REACHED', async () => {
    const z = await zoneSvc.create(manager, building._id, {
      floor: floor._id, name: 'Dãy nhỏ', vehicleType: vt._id, usageType: 'walk_in', capacity: 2,
    });
    await expect(slotSvc.createMany(manager, building._id, {
      floor: floor._id, zone: z._id, quantity: 3,
    })).rejects.toMatchObject({ errorCode: 'ZONE_CAPACITY_REACHED' });
  });

  test('vượt sức chứa dãy khi tạo lẻ → 409 ZONE_CAPACITY_REACHED', async () => {
    const z = await zoneSvc.create(manager, building._id, {
      floor: floor._id, name: 'Dãy A', vehicleType: vt._id, usageType: 'walk_in', capacity: 1,
    });
    await slotSvc.create(manager, building._id, { floor: floor._id, zone: z._id });
    await expect(slotSvc.create(manager, building._id, { floor: floor._id, zone: z._id }))
      .rejects.toMatchObject({ errorCode: 'ZONE_CAPACITY_REACHED' });
  });

  test('xóa slot đang occupied → 409', async () => {
    const z = await zoneSvc.create(manager, building._id, {
      floor: floor._id, name: 'Dãy A', vehicleType: vt._id, usageType: 'walk_in', capacity: 3,
    });
    const slot = await slotSvc.create(manager, building._id, { floor: floor._id, zone: z._id });
    await slotSvc.update(manager, building._id, slot._id, { status: 'occupied' });
    await expect(slotSvc.remove(manager, building._id, slot._id))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  test('đổi usageType khi dãy còn xe đang đỗ → 409 ZONE_HAS_OCCUPIED_SLOTS', async () => {
    const z = await zoneSvc.create(manager, building._id, {
      floor: floor._id, name: 'Dãy A', vehicleType: vt._id, usageType: 'walk_in', capacity: 3,
    });
    const slot = await slotSvc.create(manager, building._id, { floor: floor._id, zone: z._id });
    await slotSvc.update(manager, building._id, slot._id, { status: 'occupied' });

    // Đổi đối tượng sử dụng khi còn xe đỗ → chặn (propagate sẽ retype slot đang chứa xe).
    await expect(zoneSvc.update(manager, building._id, z._id, { usageType: 'subscriber' }))
      .rejects.toMatchObject({ errorCode: 'ZONE_HAS_OCCUPIED_SLOTS' });

    // Gửi lại GIÁ TRỊ CŨ (không đổi) hoặc sửa field khác vẫn được phép.
    const same = await zoneSvc.update(manager, building._id, z._id, { usageType: 'walk_in', name: 'Dãy A mới' });
    expect(same.name).toBe('Dãy A mới');

    // Xe rời bãi → đổi được, và type mới propagate xuống slot.
    await slotSvc.update(manager, building._id, slot._id, { status: 'available' });
    const changed = await zoneSvc.update(manager, building._id, z._id, { usageType: 'subscriber' });
    expect(changed.usageType).toBe('subscriber');
  });
});
