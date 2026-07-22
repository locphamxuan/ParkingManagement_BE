/** manager: customer.service — khách hàng đã dùng bãi trong building + trạng thái đăng ký gói. */
const db = require('../../helpers/db');
const f = require('../../helpers/fixtures');
const customerSvc = require('../../../src/services/manager/customer.service');
const ParkingSession = require('../../../src/models/operations/ParkingSession');
const LongTermSubscription = require('../../../src/models/policy/LongTermSubscription');

let building, manager, vt;
beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.clear();
  building = await f.createBuilding();
  manager = await f.managerFor(building._id);
  vt = await f.createVehicleType(building._id);
});

describe('customer.service.listCustomers', () => {
  test('user với subscription active → hasActivePackage:true, hasAnyPackage:true', async () => {
    const user = await f.createUser({ fullName: 'Nguyen Active' });
    const pkg = await f.createPackage(building._id, vt._id);
    await LongTermSubscription.create({
      user: user._id,
      package: pkg._id,
      building: building._id,
      plateNumber: '51F-111.11',
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      status: 'active',
    });

    const { items } = await customerSvc.listCustomers(manager, building._id, {});
    expect(items).toHaveLength(1);
    expect(items[0].fullName).toBe('Nguyen Active');
    expect(items[0].hasActivePackage).toBe(true);
    expect(items[0].hasAnyPackage).toBe(true);
    expect(items[0].subscriptions).toHaveLength(1);
    expect(items[0].subscriptions[0].plateNumber).toBe('51F-111.11');
    expect(items[0].subscriptions[0].package.name).toBe(pkg.name);
    expect(items[0].subscriptions[0].status).toBe('active');
  });

  test('user có nhiều lượt đăng ký gói (1 hết hạn + 1 active) → subscriptions trả đủ cả 2, mới nhất trước', async () => {
    const user = await f.createUser({ fullName: 'Bui MultiSub' });
    const pkg = await f.createPackage(building._id, vt._id);
    const older = await LongTermSubscription.create({
      user: user._id, package: pkg._id, building: building._id, plateNumber: '51F-222.11',
      startDate: new Date('2026-01-01'), endDate: new Date('2026-02-01'), status: 'expired',
    });
    const newer = await LongTermSubscription.create({
      user: user._id, package: pkg._id, building: building._id, plateNumber: '51F-222.11',
      startDate: new Date('2026-07-01'), endDate: new Date('2026-08-01'), status: 'active',
    });

    const { items } = await customerSvc.listCustomers(manager, building._id, {});
    expect(items[0].subscriptions).toHaveLength(2);
    expect(items[0].subscriptions.map((s) => String(s._id))).toEqual([String(newer._id), String(older._id)]);
  });

  test('user chỉ có ParkingSession (không có subscription) → hasActivePackage/hasAnyPackage false', async () => {
    const user = await f.createUser({ fullName: 'Tran NoPackage' });
    await ParkingSession.create({
      building: building._id,
      user: user._id,
      plateNumber: '51F-222.22',
    });

    const { items } = await customerSvc.listCustomers(manager, building._id, {});
    expect(items).toHaveLength(1);
    expect(items[0].fullName).toBe('Tran NoPackage');
    expect(items[0].hasActivePackage).toBe(false);
    expect(items[0].hasAnyPackage).toBe(false);
  });

  test('walk-in session (user: null) không tạo entry nào', async () => {
    await ParkingSession.create({
      building: building._id,
      user: null,
      plateNumber: '51F-333.33',
    });

    const { items } = await customerSvc.listCustomers(manager, building._id, {});
    expect(items).toHaveLength(0);
  });

  test('user thuộc building KHÁC không được liệt kê', async () => {
    const otherBuilding = await f.createBuilding();
    const otherUser = await f.createUser({ fullName: 'Le OtherBuilding' });
    await ParkingSession.create({
      building: otherBuilding._id,
      user: otherUser._id,
      plateNumber: '51F-444.44',
    });

    const { items } = await customerSvc.listCustomers(manager, building._id, {});
    expect(items).toHaveLength(0);
  });

  test('subscription đã hủy → hasAnyPackage:true, hasActivePackage:false', async () => {
    const user = await f.createUser({ fullName: 'Pham Lapsed' });
    const pkg = await f.createPackage(building._id, vt._id);
    await LongTermSubscription.create({
      user: user._id,
      package: pkg._id,
      building: building._id,
      plateNumber: '51F-555.55',
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      status: 'cancelled',
    });

    const { items } = await customerSvc.listCustomers(manager, building._id, {});
    expect(items).toHaveLength(1);
    expect(items[0].hasAnyPackage).toBe(true);
    expect(items[0].hasActivePackage).toBe(false);
  });

  test('hasPackage=true chỉ trả user đã từng đăng ký gói (any status)', async () => {
    const withPkg = await f.createUser({ fullName: 'Vo WithPackage' });
    const pkg = await f.createPackage(building._id, vt._id);
    await LongTermSubscription.create({
      user: withPkg._id,
      package: pkg._id,
      building: building._id,
      plateNumber: '51F-666.66',
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      status: 'active',
    });
    const withoutPkg = await f.createUser({ fullName: 'Do NoPackage' });
    await ParkingSession.create({
      building: building._id,
      user: withoutPkg._id,
      plateNumber: '51F-777.77',
    });

    const filtered = await customerSvc.listCustomers(manager, building._id, { hasPackage: 'true' });
    expect(filtered.items).toHaveLength(1);
    expect(filtered.items[0].fullName).toBe('Vo WithPackage');

    const notRegistered = await customerSvc.listCustomers(manager, building._id, { hasPackage: 'false' });
    expect(notRegistered.items).toHaveLength(1);
    expect(notRegistered.items[0].fullName).toBe('Do NoPackage');
  });

  test('trả kèm đầy đủ thông tin user: biển số, số dư ví, trạng thái tài khoản, ngày tham gia, lượt gửi xe + lần cuối tại toà này', async () => {
    const user = await f.createUser({
      fullName: 'Hoang FullInfo',
      phone: '0901234567',
      walletBalance: 250000,
      licensePlates: [{ plateNumber: '51F-999.11', vehicleType: 'car' }],
    });
    const firstVisit = new Date('2026-06-01T08:00:00Z');
    const lastVisit = new Date('2026-07-01T08:00:00Z');
    await ParkingSession.create({ building: building._id, user: user._id, plateNumber: '51F-999.11', entryTime: firstVisit });
    await ParkingSession.create({ building: building._id, user: user._id, plateNumber: '51F-999.11', entryTime: lastVisit });

    const { items } = await customerSvc.listCustomers(manager, building._id, {});
    expect(items).toHaveLength(1);
    const c = items[0];
    expect(c.phone).toBe('0901234567');
    expect(c.walletBalance).toBe(250000);
    expect(c.isActive).toBe(true);
    expect(c.createdAt).toBeTruthy();
    expect(c.licensePlates).toEqual([{ plateNumber: '51F-999.11', vehicleType: 'car' }]);
    expect(c.sessionCount).toBe(2);
    expect(new Date(c.lastVisitAt).toISOString()).toBe(lastVisit.toISOString());
  });

  test('user chỉ có subscription (chưa từng gửi xe tại toà) → sessionCount 0, lastVisitAt null', async () => {
    const user = await f.createUser({ fullName: 'Ly SubOnly' });
    const pkg = await f.createPackage(building._id, vt._id);
    await LongTermSubscription.create({
      user: user._id, package: pkg._id, building: building._id, plateNumber: '51F-000.11',
      startDate: new Date(), endDate: new Date(Date.now() + 30 * 24 * 3600 * 1000), status: 'active',
    });

    const { items } = await customerSvc.listCustomers(manager, building._id, {});
    expect(items[0].sessionCount).toBe(0);
    expect(items[0].lastVisitAt).toBeNull();
  });

  test('manager không thuộc building → 403', async () => {
    const otherBuilding = await f.createBuilding();
    const outsiderManager = await f.managerFor(otherBuilding._id);
    await expect(customerSvc.listCustomers(outsiderManager, building._id, {}))
      .rejects.toMatchObject({ statusCode: 403 });
  });
});
