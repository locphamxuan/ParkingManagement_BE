/**
 * SYSTEM / E2E — xác nhận hợp đồng "kiosk self-checkin công khai, không cần token"
 * qua HTTP thật. Route duy nhất trong hệ thống cố ý bỏ qua `authenticate` — nếu ai
 * đó lỡ thêm middleware auth vào đây, kiosk vật lý ngoài cổng sẽ hỏng hoàn toàn.
 */
const request = require('supertest');
const app = require('../../src/app');
const db = require('../helpers/db');
const f = require('../helpers/fixtures');
const User = require('../../src/models/user/User');
const LongTermSubscription = require('../../src/models/policy/LongTermSubscription');

beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => { await db.clear(); f.resetSeq(); });

describe('E2E · POST /api/kiosk/package-checkin (public, no auth)', () => {
  test('không kèm Authorization header vẫn được xử lý (không phải 401)', async () => {
    const res = await request(app)
      .post('/api/kiosk/package-checkin')
      .send({ qrCode: 'PLT-unknown' });

    expect(res.status).not.toBe(401);
    expect(res.status).toBe(404); // KIOSK_QR_NOT_FOUND — qua được auth, fail ở business logic
    expect(res.body.errorCode || res.body.code).toBeTruthy();
  });

  test('happy path đầy đủ qua HTTP: QR hợp lệ + gói active → 200 + tạo phiên', async () => {
    const building = await f.createBuilding();
    const vt = await f.createVehicleType(building._id);
    const floor = await f.createFloor(building._id);
    const pkg = await f.createPackage(building._id, vt._id);
    const slot = await f.createSlot(building._id, floor._id, {
      usageType: 'subscriber',
      vehicleType: vt._id,
      status: 'reserved',
    });
    const user = await User.create({
      email: 'kiosk-http@test.com', password: 'secret1', fullName: 'Kiosk Http', role: 'user',
      licensePlates: [{ plateNumber: '51F-555.55' }],
    });
    await LongTermSubscription.create({
      user: user._id, package: pkg._id, building: building._id, plateNumber: '51F-555.55', slot: slot._id,
      startDate: new Date(Date.now() - 3600 * 1000), endDate: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      status: 'active',
    });
    const qrCode = (await User.findById(user._id)).licensePlates[0].qrCode;

    const res = await request(app)
      .post('/api/kiosk/package-checkin')
      .send({ qrCode });

    expect(res.status).toBe(200);
    expect(res.body.data.parkingSession.status).toBe('active');
  });
});
