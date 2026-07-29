/** user/longTerm.service — mua/gia hạn/hủy gói dài hạn + list. */
const db = require('../../helpers/db');
const f = require('../../helpers/fixtures');
const svc = require('../../../src/services/user/longTerm.service');
const User = require('../../../src/models/user/User');
const LongTermSubscription = require('../../../src/models/policy/LongTermSubscription');
const ReservationPolicy = require('../../../src/models/policy/ReservationPolicy');
const Building = require('../../../src/models/building/Building');

let building, vt, user, pkg;

beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.clear();
  building = await f.createBuilding();
  vt = await f.createVehicleType(building._id);
  pkg = await f.createPackage(building._id, vt._id, { price: 300000, durationDays: 30 });
  user = await f.createUser({
    walletBalance: 1000000,
    licensePlates: [{ plateNumber: '51F-123.45', vehicleType: 'car' }],
  });
  // refundPercent do MANAGER cấu hình theo building — không hardcode trong service.
  await f.createReservationPolicy(building._id, { refundPercent: 95 });
});

describe('subscribe', () => {
  test('mua gói: trừ ví, tạo subscription active', async () => {
    const sub = await svc.subscribe(user._id, { packageId: pkg._id, plateNumber: '51F-123.45' });
    expect(sub.status).toBe('active');
    expect(sub.plateNumber).toBe('51F-123.45');
    const fresh = await User.findById(user._id);
    expect(fresh.walletBalance).toBe(700000); // 1_000_000 − 300_000
  });

  test('số dư không đủ → 400', async () => {
    await User.findByIdAndUpdate(user._id, { walletBalance: 1000 });
    await expect(svc.subscribe(user._id, { packageId: pkg._id, plateNumber: '51F-123.45' }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  test('biển đã có gói active/pending → 400', async () => {
    await svc.subscribe(user._id, { packageId: pkg._id, plateNumber: '51F-123.45' });
    await expect(svc.subscribe(user._id, { packageId: pkg._id, plateNumber: '51F-123.45' }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  test('biển sai định dạng → 400', async () => {
    await expect(svc.subscribe(user._id, { packageId: pkg._id, plateNumber: 'XX' }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  test('biển xe máy không thể mua gói ô tô, không trừ tiền', async () => {
    await User.findByIdAndUpdate(user._id, {
      'licensePlates.0.vehicleType': 'motorcycle',
    });

    await expect(svc.subscribe(user._id, { packageId: pkg._id, plateNumber: '51F-123.45' }))
      .rejects.toMatchObject({
        statusCode: 409,
        errorCode: 'PACKAGE_VEHICLE_TYPE_MISMATCH',
      });

    const fresh = await User.findById(user._id);
    expect(fresh.walletBalance).toBe(1000000);
    expect(await LongTermSubscription.countDocuments()).toBe(0);
  });
});

describe('cancelSubscription', () => {
  test('hủy trong 3 ngày → hoàn 95%, status cancelled', async () => {
    const sub = await svc.subscribe(user._id, { packageId: pkg._id, plateNumber: '51F-123.45' });
    const res = await svc.cancelSubscription(user._id, sub._id, { cancelReason: 'no_longer_needed' });
    expect(res.subscription.status).toBe('cancelled');
    expect(res.refundPercent).toBe(95);
    const fresh = await User.findById(user._id);
    // 700_000 còn lại + hoàn 95% × 300_000 = 285_000 → 985_000
    expect(fresh.walletBalance).toBe(985000);
  });

  test('lý do hủy không hợp lệ → 400', async () => {
    const sub = await svc.subscribe(user._id, { packageId: pkg._id, plateNumber: '51F-123.45' });
    await expect(svc.cancelSubscription(user._id, sub._id, { cancelReason: 'bad' }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  test('refundPercent lấy theo ReservationPolicy của building, không hardcode', async () => {
    await ReservationPolicy.findOneAndUpdate({ building: building._id }, { refundPercent: 50 });
    const sub = await svc.subscribe(user._id, { packageId: pkg._id, plateNumber: '51F-123.45' });
    await svc.cancelSubscription(user._id, sub._id, { cancelReason: 'no_longer_needed' });
    const fresh = await User.findById(user._id);
    // 700_000 còn lại + hoàn 50% × 300_000 = 150_000 → 850_000
    expect(fresh.walletBalance).toBe(850000);
  });

  test('building không có ReservationPolicy → fallback hoàn 80%', async () => {
    await ReservationPolicy.deleteMany({ building: building._id });
    const sub = await svc.subscribe(user._id, { packageId: pkg._id, plateNumber: '51F-123.45' });
    await svc.cancelSubscription(user._id, sub._id, { cancelReason: 'no_longer_needed' });
    const fresh = await User.findById(user._id);
    // 700_000 còn lại + hoàn 80% × 300_000 = 240_000 → 940_000
    expect(fresh.walletBalance).toBe(940000);
  });

  test('quá 3 ngày kể từ startDate → 400 CANCELLATION_WINDOW_EXPIRED', async () => {
    const sub = await svc.subscribe(user._id, { packageId: pkg._id, plateNumber: '51F-123.45' });
    await LongTermSubscription.findByIdAndUpdate(sub._id, {
      startDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    });
    await expect(svc.cancelSubscription(user._id, sub._id, { cancelReason: 'no_longer_needed' }))
      .rejects.toMatchObject({ errorCode: 'CANCELLATION_WINDOW_EXPIRED' });
  });
});

describe('renewSubscription', () => {
  test('gia hạn gói active: cộng dồn endDate, trừ ví', async () => {
    const sub = await svc.subscribe(user._id, { packageId: pkg._id, plateNumber: '51F-123.45' });
    const oldEnd = new Date(sub.endDate).getTime();
    const renewed = await svc.renewSubscription(user._id, sub._id);
    expect(new Date(renewed.endDate).getTime()).toBeGreaterThan(oldEnd);
    const fresh = await User.findById(user._id);
    expect(fresh.walletBalance).toBe(400000); // 700_000 − 300_000
  });
});

describe('listPackages + listSubscriptions', () => {
  test('list gói active của building', async () => {
    const list = await svc.listPackages(building._id);
    expect(list).toHaveLength(1);
  });
  test('ẩn package khi building đã ngưng hoạt động', async () => {
    await Building.findByIdAndUpdate(building._id, {
      status: 'inactive',
      isActive: false,
    });

    await expect(svc.listPackages()).resolves.toEqual([]);
    await expect(svc.listPackages(building._id)).resolves.toEqual([]);
  });
  test('không trừ ví khi package thuộc building đã ngưng hoạt động', async () => {
    await Building.findByIdAndUpdate(building._id, {
      status: 'inactive',
      isActive: false,
    });

    await expect(
      svc.subscribe(user._id, { packageId: pkg._id, plateNumber: '51F-123.45' }),
    ).rejects.toMatchObject({
      statusCode: 409,
      errorCode: 'BUILDING_UNAVAILABLE',
    });
    const fresh = await User.findById(user._id);
    expect(fresh.walletBalance).toBe(1000000);
  });
  test('list subscription của user', async () => {
    await svc.subscribe(user._id, { packageId: pkg._id, plateNumber: '51F-123.45' });
    const res = await svc.listSubscriptions(user._id, {});
    expect(res.pagination.total).toBe(1);
  });
});
