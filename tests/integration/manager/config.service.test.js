/** manager: vehicleType, floor, gate, reservationPolicy — CRUD + ràng buộc. */
const db = require('../../helpers/db');
const f = require('../../helpers/fixtures');
const vtSvc = require('../../../src/services/manager/vehicleType.service');
const floorSvc = require('../../../src/services/manager/floor.service');
const gateSvc = require('../../../src/services/manager/gate.service');
const rpSvc = require('../../../src/services/manager/reservationPolicy.service');
const Gate = require('../../../src/models/building/Gate');

let building, manager;
beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.clear();
  building = await f.createBuilding();
  manager = await f.managerFor(building._id);
});

describe('vehicleType.service', () => {
  test('create + sinh code từ name; trùng code → 409', async () => {
    const vt = await vtSvc.create(manager, building._id, { name: 'Ô tô', code: 'CAR' });
    expect(vt.code).toBe('CAR');
    await expect(vtSvc.create(manager, building._id, { name: 'Car 2', code: 'CAR' }))
      .rejects.toMatchObject({ errorCode: 'DUPLICATE_VEHICLE_TYPE_CODE' });
  });

  test('remove bị chặn khi có zone tham chiếu', async () => {
    const vt = await vtSvc.create(manager, building._id, { name: 'Ô tô', code: 'CAR' });
    const floor = await f.createFloor(building._id);
    await f.createZone(building._id, floor._id, vt._id, { usageType: 'walk_in' });
    await expect(vtSvc.remove(manager, building._id, vt._id))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  test('không phải manager của tòa → 403', async () => {
    const other = await f.managerFor(building._id);
    other.assignedBuildings = []; // không sở hữu
    await expect(vtSvc.list(other, building._id)).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('floor.service', () => {
  test('create floor: code sinh từ tên, trùng thì thêm số đuôi', async () => {
    const fl = await floorSvc.create(manager, building._id, { name: 'Tầng 1', capacity: 50 });
    expect(fl.code).toBe('T1');
    expect(fl.name).toBe('Tầng 1');
    expect(fl.capacity).toBe(50);
    const fl2 = await floorSvc.create(manager, building._id, { name: 'Hầm B1', capacity: 30 });
    expect(fl2.code).toBe('HB1');
    const fl3 = await floorSvc.create(manager, building._id, { name: 'Tầng trệt', capacity: 20 });
    expect(fl3.code).toBe('TT');
    const fl4 = await floorSvc.create(manager, building._id, { name: 'Tầng trệt', capacity: 20 });
    expect(fl4.code).toBe('TT2');
  });

  test('giảm capacity dưới tổng zone → 409 FLOOR_CAPACITY_BELOW_ZONES', async () => {
    const vt = await f.createVehicleType(building._id);
    const fl = await f.createFloor(building._id, { capacity: 20 });
    await f.createZone(building._id, fl._id, vt._id, { capacity: 15 });
    await expect(floorSvc.update(manager, building._id, fl._id, { capacity: 10 }))
      .rejects.toMatchObject({ errorCode: 'FLOOR_CAPACITY_BELOW_ZONES' });
  });

  test('remove floor còn slot → 409', async () => {
    const fl = await f.createFloor(building._id);
    await f.createSlot(building._id, fl._id);
    await expect(floorSvc.remove(manager, building._id, fl._id))
      .rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('gate.service', () => {
  test('list tự tạo cổng mặc định IN + OUT', async () => {
    const gates = await gateSvc.list(manager, building._id);
    const dirs = gates.map((g) => g.direction).sort();
    expect(dirs).toEqual(['in', 'out']);
  });

  test('create trùng mã → 409', async () => {
    await gateSvc.create(manager, building._id, { code: 'G1', direction: 'in' });
    await expect(gateSvc.create(manager, building._id, { code: 'G1', direction: 'out' }))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  test('xóa cổng VÀO cuối cùng → 409', async () => {
    await gateSvc.list(manager, building._id); // sinh IN + OUT
    const inGate = await Gate.findOne({ building: building._id, direction: 'in' });
    await expect(gateSvc.remove(manager, building._id, inGate._id))
      .rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('reservationPolicy.service', () => {
  test('get tạo policy mặc định nếu chưa có', async () => {
    const p = await rpSvc.get(manager, building._id);
    expect(p.depositPercent).toBe(15);
    expect(p.refundPercent).toBe(80);
  });

  test('upsert cập nhật % hợp lệ', async () => {
    await rpSvc.get(manager, building._id);
    const p = await rpSvc.upsert(manager, building._id, { depositPercent: 30, refundPercent: 50 });
    expect(p.depositPercent).toBe(30);
    expect(p.refundPercent).toBe(50);
  });

  test('% ngoài [0,100] → 400', async () => {
    await expect(rpSvc.upsert(manager, building._id, { depositPercent: 150 }))
      .rejects.toMatchObject({ statusCode: 400 });
  });
});
