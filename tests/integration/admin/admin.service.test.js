/** admin: user CRUD + role guard, revenue report, audit list, pricePolicy read. */
const db = require('../../helpers/db');
const f = require('../../helpers/fixtures');
const userSvc = require('../../../src/services/admin/user.service');
const revenueSvc = require('../../../src/services/admin/revenue.service');
const auditSvc = require('../../../src/services/admin/audit.service');
const pricePolicySvc = require('../../../src/services/admin/pricePolicy.service');
const Payment = require('../../../src/models/finance/Payment');
const AuditLog = require('../../../src/models/log/AuditLog');
const ParkingSession = require('../../../src/models/operations/ParkingSession');
const LongTermSubscription = require('../../../src/models/policy/LongTermSubscription');

let admin;
beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => { await db.clear(); admin = await f.createUser({ role: 'admin' }); });

describe('user.service', () => {
  test('create user (mặc định role user)', async () => {
    const u = await userSvc.create(admin, { email: 'new@test.com', password: 'secret1', fullName: 'New' });
    expect(u.role).toBe('user');
  });

  test('create email trùng → 409', async () => {
    await userSvc.create(admin, { email: 'dup@test.com', password: 'secret1', fullName: 'A' });
    await expect(userSvc.create(admin, { email: 'dup@test.com', password: 'secret1', fullName: 'B' }))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  test('tạo 2 user không nhập phone → không đụng sparse unique index', async () => {
    const u1 = await userSvc.create(admin, { email: 'nophone1@test.com', password: 'secret1', fullName: 'A' });
    const u2 = await userSvc.create(admin, { email: 'nophone2@test.com', password: 'secret1', fullName: 'B' });
    expect(u1.phone).toBeFalsy();
    expect(u2.phone).toBeFalsy();
  });

  test('update set role staff trực tiếp → 400 USE_ASSIGNMENT_ENDPOINT', async () => {
    const u = await f.createUser({ role: 'user' });
    await expect(userSvc.update(admin, u._id, { role: 'staff' }))
      .rejects.toMatchObject({ errorCode: 'USE_ASSIGNMENT_ENDPOINT' });
  });

  test('updateStatus không đổi được trạng thái admin', async () => {
    const other = await f.createUser({ role: 'admin' });
    await expect(userSvc.updateStatus(admin, other._id, false))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  test('generic update cannot bypass admin role/status protection', async () => {
    const other = await f.createUser({ role: 'admin' });
    await expect(userSvc.update(admin, other._id, { role: 'user' }))
      .rejects.toMatchObject({ errorCode: 'ADMIN_ROLE_IMMUTABLE' });
    await expect(userSvc.update(admin, other._id, { isActive: false }))
      .rejects.toMatchObject({ errorCode: 'ADMIN_STATUS_IMMUTABLE' });
  });

  test('updateStatus khóa/mở user thường', async () => {
    const u = await f.createUser({ role: 'user' });
    const locked = await userSvc.updateStatus(admin, u._id, false);
    expect(locked.isActive).toBe(false);
  });

  test('list lọc theo role + phân trang', async () => {
    await f.createUser({ role: 'user' });
    await f.createUser({ role: 'staff' });
    const staffOnly = await userSvc.list({ role: 'staff' });
    expect(staffOnly.items.every((u) => u.role === 'staff')).toBe(true);
  });

  test('xóa user còn phiên gửi xe active → 409 USER_HAS_ACTIVE_SESSION (force cũng không bypass)', async () => {
    const building = await f.createBuilding();
    const u = await f.createUser({ role: 'user' });
    await ParkingSession.create({
      building: building._id, user: u._id, plateNumber: '51F-123.45',
      entryTime: new Date(), status: 'active',
    });
    await expect(userSvc.remove(admin, u._id))
      .rejects.toMatchObject({ errorCode: 'USER_HAS_ACTIVE_SESSION' });
    await expect(userSvc.remove(admin, u._id, { force: true }))
      .rejects.toMatchObject({ errorCode: 'USER_HAS_ACTIVE_SESSION' });
  });

  test('xóa user còn gói dài hạn active → 409 USER_HAS_ACTIVE_SUBSCRIPTION; hết active thì xóa được', async () => {
    const building = await f.createBuilding();
    const vt = await f.createVehicleType(building._id);
    const pkg = await f.createPackage(building._id, vt._id);
    const u = await f.createUser({ role: 'user' });
    const sub = await LongTermSubscription.create({
      user: u._id, package: pkg._id, building: building._id, plateNumber: '51F-123.45',
      startDate: new Date(), endDate: new Date(Date.now() + 30 * 24 * 3600 * 1000), status: 'active',
    });
    await expect(userSvc.remove(admin, u._id))
      .rejects.toMatchObject({ errorCode: 'USER_HAS_ACTIVE_SUBSCRIPTION' });

    // Gói không còn active → xóa user được.
    sub.status = 'cancelled';
    await sub.save();
    await expect(userSvc.remove(admin, u._id))
      .rejects.toMatchObject({ errorCode: 'USER_HAS_HISTORY' });
  });

  test('khóa user còn phiên active: vẫn khóa được, audit ghi severity high kèm số phiên', async () => {
    const building = await f.createBuilding();
    const u = await f.createUser({ role: 'user' });
    await ParkingSession.create({
      building: building._id, user: u._id, plateNumber: '51F-123.45',
      entryTime: new Date(), status: 'active',
    });
    const locked = await userSvc.updateStatus(admin, u._id, false);
    expect(locked.isActive).toBe(false);

    const log = await AuditLog.findOne({ action: 'LOCK_USER', targetId: u._id });
    expect(log.severity).toBe('high');
    expect(log.newValue.activeSessions).toBe(1);
  });
});

describe('revenue.service', () => {
  test('thiếu from/to → 400', async () => {
    await expect(revenueSvc.getReport({})).rejects.toMatchObject({ statusCode: 400 });
  });

  test('tổng hợp doanh thu theo tòa nhà từ Payment success', async () => {
    const b = await f.createBuilding();
    await Payment.create([
      { building: b._id, type: 'session', method: 'cash', amount: 20000, status: 'success' },
      { building: b._id, type: 'reservation', method: 'wallet', amount: 30000, status: 'success' },
      { building: b._id, type: 'session', method: 'cash', amount: 10000, status: 'pending' }, // bỏ (pending)
    ]);
    const from = new Date(Date.now() - 24 * 3600 * 1000);
    const to = new Date(Date.now() + 24 * 3600 * 1000);
    const res = await revenueSvc.getReport({ from, to });
    expect(res.grandTotal).toBe(50000);
  });
});

describe('audit.service', () => {
  test('list audit log lọc theo action', async () => {
    await AuditLog.create([
      { actor: admin._id, action: 'CREATE_USER', targetTable: 'users', severity: 'low' },
      { actor: admin._id, action: 'DELETE_USER', targetTable: 'users', severity: 'high' },
    ]);
    const res = await auditSvc.list({ action: 'create_user' });
    expect(res.pagination.total).toBe(1);
  });
});

describe('pricePolicy.service (admin read-only)', () => {
  test('list theo building', async () => {
    const b = await f.createBuilding();
    const vt = await f.createVehicleType(b._id);
    await f.createPricePolicy(b._id, vt._id, { hourlyRate: 12345 });
    const res = await pricePolicySvc.list({ buildingId: b._id });
    expect(res).toHaveLength(1);
    expect(res[0].hourlyRate).toBe(12345);
  });
});
