/** user/parkingHistory.service — chỉ liệt kê phiên gửi xe TRỰC TIẾP (reservation=null). */
const db = require('../../helpers/db');
const f = require('../../helpers/fixtures');
const svc = require('../../../src/services/user/parkingHistory.service');
const ParkingSession = require('../../../src/models/operations/ParkingSession');
const mongoose = require('mongoose');

let user, building;
beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => { await db.clear(); user = await f.createUser(); building = await f.createBuilding(); });

test('chỉ trả phiên trực tiếp (bỏ phiên gắn reservation)', async () => {
  await ParkingSession.create({ plateNumber: '51F-123.45', building: building._id, user: user._id, reservation: null });
  await ParkingSession.create({ plateNumber: '51F-123.46', building: building._id, user: user._id, reservation: new mongoose.Types.ObjectId() });
  const res = await svc.list(user._id, {});
  expect(res.pagination.total).toBe(1);
  expect(res.items[0].plateNumber).toBe('51F-123.45');
});

test('lọc theo buildingId', async () => {
  const b2 = await f.createBuilding();
  await ParkingSession.create({ plateNumber: '51F-123.45', building: building._id, user: user._id, reservation: null });
  await ParkingSession.create({ plateNumber: '51F-123.47', building: b2._id, user: user._id, reservation: null });
  const res = await svc.list(user._id, { buildingId: building._id });
  expect(res.pagination.total).toBe(1);
});
