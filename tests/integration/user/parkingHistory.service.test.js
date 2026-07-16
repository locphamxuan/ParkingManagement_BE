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
