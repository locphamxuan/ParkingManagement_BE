/** System/E2E contract for a managed kiosk device authenticated by device token. */
const request = require('supertest');
const app = require('../../src/app');
const db = require('../helpers/db');
const f = require('../helpers/fixtures');
const User = require('../../src/models/user/User');
const LongTermSubscription = require('../../src/models/policy/LongTermSubscription');

beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => { await db.clear(); f.resetSeq(); });

describe('E2E · POST /api/kiosk/package-checkin (managed device)', () => {
  test('missing device token is rejected before business logic', async () => {
    const res = await request(app)
      .post('/api/kiosk/package-checkin')
      .send({ qrCode: 'PLT-unknown' });

    expect(res.status).toBe(401);
    expect(res.body.errorCode || res.body.code).toBe('KIOSK_DEVICE_UNAUTHORIZED');
  });

  test('happy path đầy đủ qua HTTP: QR hợp lệ + gói active → 200 + tạo phiên', async () => {
    const building = await f.createBuilding();
    const vt = await f.createVehicleType(building._id);
    const floor = await f.createFloor(building._id);
    const gate = await f.createGate(building._id, { direction: 'in' });
    const pkg = await f.createPackage(building._id, vt._id);
    const slot = await f.createSlot(building._id, floor._id, {
      usageType: 'subscriber',
      vehicleType: vt._id,
      status: 'reserved',
    });
    const user = await f.createUser({
      email: 'kiosk-http@test.com', fullName: 'Kiosk Http',
      vehicles: [{ plateNumber: '51F-555.55' }],
    });
    await LongTermSubscription.create({
      user: user._id, package: pkg._id, building: building._id, plateNumber: '51F-555.55', slot: slot._id,
      startDate: new Date(Date.now() - 3600 * 1000), endDate: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      status: 'active',
    });
    const qrCode = user.vehicles[0].qrCode;

    const res = await request(app)
      .post('/api/kiosk/package-checkin')
      .set('x-kiosk-device-token', process.env.KIOSK_DEVICE_TOKEN)
      .send({ qrCode, gate: gate._id });

    expect(res.status).toBe(200);
    expect(res.body.data.parkingSession.status).toBe('active');
  });
});
