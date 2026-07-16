/**
 * SYSTEM / END-TO-END TEST
 * ------------------------------------------------------------------
 * Kiểm thử hệ thống: chạy XUYÊN SUỐT qua HTTP (supertest → Express app →
 * router → middleware auth/RBAC → controller → service → transaction → DB).
 * Khác với integration test (gọi thẳng service), bộ này đi qua toàn bộ tầng
 * để xác nhận hệ thống ráp lại vẫn đúng nghiệp vụ end-to-end.
 *
 * Bao phủ 2 kịch bản hệ thống:
 *   A. Auth & RBAC boundary  — login, thiếu token (401), sai role (403).
 *   B. Walk-in lifecycle     — staff check-in → check-out → phí vào ví tòa.
 */
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../src/app');
const db = require('../helpers/db');
const f = require('../helpers/fixtures');
const { signToken } = require('../../src/utils/token');
const BuildingManager = require('../../src/models/building/BuildingManager');
const ParkingSlot = require('../../src/models/building/ParkingSlot');
const BuildingWallet = require('../../src/models/finance/BuildingWallet');
const User = require('../../src/models/user/User');

const IMG = 'data:image/png;base64,AAAA';
const bearer = (token) => `Bearer ${token}`;

beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => { await db.clear(); f.resetSeq(); });

/** Dựng một tòa nhà đầy đủ + staff có ca hôm nay + 1 khách có ví. */
async function seedFullScene() {
  const building = await f.createBuilding({ operatingHours: { open: '00:00', close: '23:59' } });
  const vt = await f.createVehicleType(building._id);
  const floor = await f.createFloor(building._id, { capacity: 100 });
  const zone = await f.createZone(building._id, floor._id, vt._id, { usageType: 'walk_in' });
  const slot = await f.createSlot(building._id, floor._id, {
    zone: zone._id, vehicleType: vt._id, usageType: 'walk_in',
  });

  // Staff: cần assignment (BuildingManager) để middleware nạp assignedBuildings,
  // và một ca active hôm nay để được phép check-in.
  const staff = await f.createUser({ role: 'staff', password: 'secret1' });
  await BuildingManager.create({ building: building._id, user: staff._id, isActive: true });
  const shift = await f.createShift(building._id);
  await f.createStaffShift(building._id, staff._id, shift._id, { status: 'active' });

  // Manager của tòa: xác nhận tiền mặt pending (luồng ví building).
  const manager = await f.createUser({ role: 'manager', password: 'secret1' });
  await BuildingManager.create({ building: building._id, user: manager._id, isActive: true });

  // Khách có số dư ví để trả phí.
  const customer = await f.createUser({ role: 'user', password: 'secret1', walletBalance: 1_000_000 });

  return {
    building, vt, floor, zone, slot, staff, customer, manager,
    staffToken: signToken(staff._id),
    userToken: signToken(customer._id),
    managerToken: signToken(manager._id),
  };
}

// ───────────────────────────── A. AUTH & RBAC ──────────────────────────────
describe('E2E · Auth & RBAC boundary (HTTP)', () => {
  test('login thành công trả token + user', async () => {
    const s = await seedFullScene();
    const res = await request(app)
      .post('/api/users/auth/login')
      .send({ email: s.customer.email, password: 'secret1' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.user.email).toBe(s.customer.email);
  });

  test('login sai mật khẩu → 401', async () => {
    const s = await seedFullScene();
    const res = await request(app)
      .post('/api/users/auth/login')
      .send({ email: s.customer.email, password: 'wrong-pass' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('gọi API cần đăng nhập mà thiếu token → 401', async () => {
    const res = await request(app).get('/api/users/profile');
    expect(res.status).toBe(401);
  });

  test('user gọi endpoint dành cho staff → 403 (RBAC chặn)', async () => {
    const s = await seedFullScene();
    const res = await request(app)
      .get('/api/staff/dashboard')
      .set('Authorization', bearer(s.userToken));
    expect(res.status).toBe(403);
  });
});

// ─────────────────────── B. WALK-IN LIFECYCLE (STAFF) ──────────────────────
describe('E2E · Walk-in lifecycle (check-in → check-out → ví tòa)', () => {
  test('check-in tạo phiên active + chiếm ô, check-out thu tiền mặt + hoàn ô + ghi ví tòa', async () => {
    const s = await seedFullScene();

    // 1) Check-in qua HTTP
    const checkInRes = await request(app)
      .post('/api/staff/parking-sessions/check-in')
      .set('Authorization', bearer(s.staffToken))
      .send({
        building: String(s.building._id),
        plateNumber: '51F-123.45',
        vehicleType: String(s.vt._id),
        portraitImage: IMG,
        plateImage: IMG,
      });

    expect(checkInRes.status).toBe(200);
    const session = checkInRes.body.data;
    expect(session.status).toBe('active');
    expect(String(session.slot)).toBe(String(s.slot._id));

    const occupied = await ParkingSlot.findById(s.slot._id);
    expect(occupied.status).toBe('occupied');

    // Lùi giờ vào 2h để phát sinh phí khi check-out.
    const ParkingSession = require('../../src/models/operations/ParkingSession');
    await ParkingSession.findByIdAndUpdate(session._id, {
      entryTime: new Date(Date.now() - 2 * 3600 * 1000),
    });

    // 2) Check-out (tiền mặt) qua HTTP
    const checkOutRes = await request(app)
      .patch(`/api/staff/parking-sessions/${session._id}/check-out`)
      .set('Authorization', bearer(s.staffToken))
      .send({ paymentMethod: 'cash' });

    expect(checkOutRes.status).toBe(200);
    const done = checkOutRes.body.data;
    expect(done.status).toBe('completed');
    expect(done.fee).toBeGreaterThan(0);

    // Ô đỗ được giải phóng.
    const freed = await ParkingSlot.findById(s.slot._id);
    expect(freed.status).toBe('available');

    // Tiền mặt KHÔNG vào ví ngay — nằm ở pending chờ manager xác nhận.
    const walletBefore = await BuildingWallet.findOne({ building: s.building._id });
    expect(walletBefore?.balance ?? 0).toBe(0);

    // 3) Manager thấy khoản pending và bấm "Thu nhận" qua HTTP → ví được cộng.
    const pendingRes = await request(app)
      .get(`/api/manager/buildings/${s.building._id}/wallet/pending-cash`)
      .set('Authorization', bearer(s.managerToken));
    expect(pendingRes.status).toBe(200);
    const pendingItems = pendingRes.body.data.items;
    expect(pendingItems.length).toBe(1);
    expect(pendingItems[0].amount).toBe(done.fee);

    const confirmRes = await request(app)
      .post(`/api/manager/buildings/${s.building._id}/wallet/pending-cash/${pendingItems[0]._id}/confirm`)
      .set('Authorization', bearer(s.managerToken));
    expect(confirmRes.status).toBe(200);

    const wallet = await BuildingWallet.findOne({ building: s.building._id });
    expect(wallet).not.toBeNull();
    expect(wallet.balance).toBe(done.fee);
  });

  test('check-in thiếu ảnh chân dung → 400', async () => {
    const s = await seedFullScene();
    const res = await request(app)
      .post('/api/staff/parking-sessions/check-in')
      .set('Authorization', bearer(s.staffToken))
      .send({
        building: String(s.building._id),
        plateNumber: '51F-999.99',
        vehicleType: String(s.vt._id),
        plateImage: IMG,
      });
    expect(res.status).toBe(400);
  });
});
