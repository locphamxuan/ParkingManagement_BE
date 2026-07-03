/** staff/reservation.service — check-in lượt đặt chỗ + list + expire. */
const db = require('../../helpers/db');
const f = require('../../helpers/fixtures');
const svc = require('../../../src/services/staff/reservation.service');
const Reservation = require('../../../src/models/operations/Reservation');
const ParkingSlot = require('../../../src/models/building/ParkingSlot');

let building, staff, vt, floor, slot;

async function makeReservation(over = {}) {
  const start = new Date(Date.now() - 5 * 60 * 1000); // 5 phút trước → trong hold window
  const end = new Date(start.getTime() + 2 * 3600 * 1000);
  return Reservation.create({
    code: over.code || 'RSV-ABC123',
    user: over.user || (await f.createUser())._id,
    building: building._id,
    vehicleType: vt._id,
    slot: over.slot ?? slot._id,
    plateNumber: over.plateNumber || '51F-123.45',
    startTime: start,
    endTime: end,
    status: over.status || 'confirmed',
  });
}

beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.clear();
  building = await f.createBuilding();
  staff = await f.createUser({ role: 'staff' });
  staff.assignedBuildings = [building._id];
  vt = await f.createVehicleType(building._id);
  floor = await f.createFloor(building._id);
  slot = await f.createSlot(building._id, floor._id, { status: 'reserved', vehicleType: vt._id });
  await f.createReservationPolicy(building._id, { maxHoldMinutes: 30 });
  const shift = await f.createShift(building._id);
  await f.createStaffShift(building._id, staff._id, shift._id, { status: 'active' });
}, 20000);

test('check-in reservation theo code: tạo phiên active, slot → occupied, reservation → checked_in', async () => {
  const r = await makeReservation();
  const res = await svc.processReservationCheckIn(staff, { code: r.code });
  expect(res.parkingSession.status).toBe('active');
  expect(String(res.parkingSession.reservation)).toBe(String(r._id));
  const freshR = await Reservation.findById(r._id);
  expect(freshR.status).toBe('checked_in');
  const freshSlot = await ParkingSlot.findById(slot._id);
  expect(freshSlot.status).toBe('occupied');
});

test('reservation không tồn tại → 404', async () => {
  await expect(svc.processReservationCheckIn(staff, { code: 'RSV-NONE' }))
    .rejects.toMatchObject({ statusCode: 404 });
});

test('reservation đã checked_in → 409', async () => {
  const r = await makeReservation({ status: 'checked_in' });
  await expect(svc.processReservationCheckIn(staff, { code: r.code }))
    .rejects.toMatchObject({ statusCode: 409 });
});

test('listReservations lọc theo status', async () => {
  await makeReservation({ code: 'RSV-1', status: 'confirmed' });
  await makeReservation({ code: 'RSV-2', status: 'pending', slot: null });
  const res = await svc.listReservations(building._id, { status: 'confirmed' });
  expect(res.pagination.total).toBe(1);
});

test('expireReservation: đánh dấu expired + nhả slot', async () => {
  const r = await makeReservation();
  const expired = await svc.expireReservation(staff, { reservationId: r._id });
  expect(expired.status).toBe('expired');
  const freshSlot = await ParkingSlot.findById(slot._id);
  expect(freshSlot.status).toBe('available');
});
