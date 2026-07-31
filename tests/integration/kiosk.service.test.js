/**
 * kiosk.service — self check-in KHÔNG XÁC THỰC cho khách gói dài hạn quét QR
 * phương tiện tại cổng (không cần nhân viên). Đây là route state-changing DUY
 * NHẤT trong hệ thống không yêu cầu auth — chưa từng có test trước đợt audit này.
 */
const db = require('../helpers/db');
const f = require('../helpers/fixtures');
const kioskSvc = require('../../src/services/kiosk.service');
const User = require('../../src/models/user/User');
const LongTermSubscription = require('../../src/models/policy/LongTermSubscription');
const ParkingSlot = require('../../src/models/building/ParkingSlot');
const ParkingSession = require('../../src/models/operations/ParkingSession');

let building, vt, floor, user, pkg, kioskGate;

beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.clear();
  f.resetSeq();
  building = await f.createBuilding();
  vt = await f.createVehicleType(building._id);
  floor = await f.createFloor(building._id);
  kioskGate = await f.createGate(building._id, { direction: 'in' });
  pkg = await f.createPackage(building._id, vt._id);
});

/** User có 1 biển đăng ký (qrCode tự sinh) + gói dài hạn active gắn slot cố định. */
const seedSubscriberWithDedicatedSlot = async () => {
  user = await f.createUser({
    email: 'kiosk-owner@test.com', fullName: 'Kiosk Owner',
    vehicles: [{ plateNumber: '51F-777.77', category: 'car' }],
  });
  const dedicatedSlot = await f.createSlot(building._id, floor._id, {
    usageType: 'subscriber', vehicleType: vt._id, status: 'reserved',
  });
  const subscription = await LongTermSubscription.create({
    user: user._id, package: pkg._id, building: building._id,
    plateNumber: '51F-777.77', slot: dedicatedSlot._id,
    startDate: new Date(Date.now() - 24 * 3600 * 1000),
    endDate: new Date(Date.now() + 29 * 24 * 3600 * 1000),
    status: 'active',
  });
  const qrCode = user.vehicles[0].qrCode;
  return { user, dedicatedSlot, subscription, qrCode };
};

describe('kiosk.service.selfCheckInByQr', () => {
  test('thiếu qrCode → 400 VEHICLE_QR_REQUIRED', async () => {
    await expect(kioskSvc.selfCheckInByQr({})).rejects.toMatchObject({
      statusCode: 400, errorCode: 'VEHICLE_QR_REQUIRED',
    });
  });

  test('qrCode không khớp xe đã đăng ký nào → 404 VEHICLE_QR_NOT_FOUND (không cho bare biển số)', async () => {
    await f.createUser({
      email: 'someone@test.com', fullName: 'Someone',
      vehicles: [{ plateNumber: '30A-123.45' }],
    });
    await expect(kioskSvc.selfCheckInByQr({ qrCode: 'PLT-doesnotexist' })).rejects.toMatchObject({
      statusCode: 404, errorCode: 'VEHICLE_QR_NOT_FOUND',
    });
  });

  test('mã QR đã quá hạn → 410 VEHICLE_QR_EXPIRED, kiosk không nhận xe', async () => {
    const expiredOwner = await f.createUser({
      email: 'expired@test.com', fullName: 'Expired QR',
      vehicles: [{
        plateNumber: '30A-123.46',
        qrExpiresAt: new Date(Date.now() - 60 * 1000),
      }],
    });
    await expect(
      kioskSvc.selfCheckInByQr({ qrCode: expiredOwner.vehicles[0].qrCode }),
    ).rejects.toMatchObject({ statusCode: 410, errorCode: 'VEHICLE_QR_EXPIRED' });
  });

  test('QR hợp lệ nhưng không có gói dài hạn active cho biển này → 404 SUBSCRIPTION_NOT_FOUND', async () => {
    const walkInUser = await f.createUser({
      email: 'noplan@test.com', fullName: 'No Plan',
      vehicles: [{ plateNumber: '29A-999.99' }],
    });
    const qrCode = walkInUser.vehicles[0].qrCode;
    await expect(kioskSvc.selfCheckInByQr({ qrCode })).rejects.toMatchObject({
      statusCode: 404, errorCode: 'SUBSCRIPTION_NOT_FOUND',
    });
  });

  test('QR hợp lệ + gói active + slot cố định trống → tạo phiên, gán đúng slot cố định, fee=0', async () => {
    const { dedicatedSlot, qrCode, subscription } = await seedSubscriberWithDedicatedSlot();

    const result = await kioskSvc.selfCheckInByQr({ qrCode, gate: kioskGate._id });

    expect(result.parkingSession.status).toBe('active');
    expect(result.parkingSession.fee).toBe(0);
    expect(result.parkingSession.paymentMethod).toBe('long_term');
    expect(String(result.parkingSession.slot)).toBe(String(dedicatedSlot._id));
    expect(String(result.subscription._id)).toBe(String(subscription._id));

    expect((await ParkingSlot.findById(dedicatedSlot._id)).status).toBe('occupied');
  });

  test('slot cố định đang occupied → tự động fallback sang slot trống dãy subscriber', async () => {
    const { dedicatedSlot, qrCode } = await seedSubscriberWithDedicatedSlot();
    dedicatedSlot.status = 'occupied';
    await dedicatedSlot.save();
    await f.createSlot(building._id, floor._id, { usageType: 'subscriber', vehicleType: vt._id });

    await expect(kioskSvc.selfCheckInByQr({ qrCode, gate: kioskGate._id })).rejects.toMatchObject({
      statusCode: 409, errorCode: 'FIXED_SLOT_OCCUPIED',
    });
  });

  test('không còn slot nào (cố định occupied, không có fallback) → 409 NO_SLOT_AVAILABLE', async () => {
    const { dedicatedSlot, qrCode } = await seedSubscriberWithDedicatedSlot();
    dedicatedSlot.status = 'occupied';
    await dedicatedSlot.save();

    await expect(kioskSvc.selfCheckInByQr({ qrCode, gate: kioskGate._id })).rejects.toMatchObject({
      statusCode: 409, errorCode: 'FIXED_SLOT_OCCUPIED',
    });
  });

  test('xe đã có phiên active trong cùng toà → 409 DUPLICATE_PLATE, không tạo phiên mới', async () => {
    const { qrCode } = await seedSubscriberWithDedicatedSlot();
    await ParkingSession.create({
      building: building._id, plateNumber: '51F-777.77', category: vt._id, status: 'active',
      entryTime: new Date(),
    });

    await expect(kioskSvc.selfCheckInByQr({ qrCode, gate: kioskGate._id })).rejects.toMatchObject({
      statusCode: 409, errorCode: 'DUPLICATE_PLATE',
    });
    expect(await ParkingSession.countDocuments({ plateNumber: '51F-777.77', status: 'active' })).toBe(1);
  });
});
