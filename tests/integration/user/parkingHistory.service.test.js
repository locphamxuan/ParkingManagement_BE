/** user/parkingHistory.service — liệt kê phiên gửi xe của user. */
const db = require('../../helpers/db');
const f = require('../../helpers/fixtures');
const svc = require('../../../src/services/user/parkingHistory.service');
const ParkingSession = require('../../../src/models/operations/ParkingSession');

let user, building;
beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => { await db.clear(); user = await f.createUser(); building = await f.createBuilding(); });

test('chỉ trả phiên của đúng user', async () => {
  const other = await f.createUser();
  await ParkingSession.create({ plateNumber: '51F-123.45', building: building._id, user: user._id });
  await ParkingSession.create({ plateNumber: '51F-123.46', building: building._id, user: other._id });
  const res = await svc.list(user._id, {});
  expect(res.pagination.total).toBe(1);
  expect(res.items[0].plateNumber).toBe('51F-123.45');
});

test('lọc theo buildingId', async () => {
  const b2 = await f.createBuilding();
  await ParkingSession.create({ plateNumber: '51F-123.45', building: building._id, user: user._id });
  await ParkingSession.create({ plateNumber: '51F-123.47', building: b2._id, user: user._id });
  const res = await svc.list(user._id, { buildingId: building._id });
  expect(res.pagination.total).toBe(1);
});

test('trả kèm checkIn/checkOut/duration + populate slot(floor)/gate — FE web lẫn Mobile đều cần các field này ngay ở list, không chỉ ở detail', async () => {
  const floor = await f.createFloor(building._id);
  const slot = await f.createSlot(building._id, floor._id);
  const entryTime = new Date('2026-07-01T08:00:00Z');
  const exitTime = new Date('2026-07-01T09:30:00Z');
  await ParkingSession.create({
    plateNumber: '51F-777.77', building: building._id, user: user._id, slot: slot._id,
    entryTime, exitTime, status: 'completed',
  });

  const res = await svc.list(user._id, {});
  const item = res.items[0];
  expect(item.checkIn).toEqual(entryTime);
  expect(item.checkOut).toEqual(exitTime);
  expect(item.duration).toBe(90); // 1h30 = 90 phút
  expect(item.slot.code).toBe(slot.code);
  expect(item.slot.floor.name).toBe(floor.name);
});

test('phân trang ổn định khi nhiều phiên trùng entryTime — không lặp, không mất item', async () => {
  const entryTime = new Date('2026-07-01T08:00:00Z');
  const created = [];
  for (let i = 0; i < 5; i += 1) {
    created.push(await ParkingSession.create({
      plateNumber: `51F-90${i}.00`,
      building: building._id,
      user: user._id,
      entryTime,
      status: 'completed',
    }));
  }
  const expectedOrder = created
    .map((session) => `${session._id}`)
    .sort()
    .reverse();

  const page1 = await svc.list(user._id, { page: 1, limit: 2 });
  const page2 = await svc.list(user._id, { page: 2, limit: 2 });
  const page3 = await svc.list(user._id, { page: 3, limit: 2 });

  expect(page1.pagination.total).toBe(5);
  expect(page1.pagination.totalPages).toBe(3);

  const paged = [...page1.items, ...page2.items, ...page3.items].map((item) => `${item._id}`);
  expect(paged).toEqual(expectedOrder);          // deterministic: _id giảm dần
  expect(new Set(paged).size).toBe(5);           // không item nào bị lặp
  expect(paged).toHaveLength(5);                 // không item nào bị mất

  // Gọi lại vẫn ra đúng thứ tự cũ (không phụ thuộc thứ tự tự nhiên của storage).
  const page1Again = await svc.list(user._id, { page: 1, limit: 2 });
  expect(page1Again.items.map((item) => `${item._id}`)).toEqual(expectedOrder.slice(0, 2));
});

test('phiên đang active (chưa checkout) → checkOut null, duration null', async () => {
  await ParkingSession.create({
    plateNumber: '51F-888.88', building: building._id, user: user._id, status: 'active',
  });
  const res = await svc.list(user._id, {});
  expect(res.items[0].checkOut).toBeNull();
  expect(res.items[0].duration).toBeNull();
});
