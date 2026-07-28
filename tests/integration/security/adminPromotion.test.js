/**
 * Admin accounts are deployment/bootstrap provisioned. Nothing reachable from
 * the user-management screen may mint one — note that promotion is also
 * effectively irreversible, since the existing guards then refuse to change or
 * delete an admin account.
 */
const db = require('../../helpers/db');
const f = require('../../helpers/fixtures');
const User = require('../../../src/models/user/User');
const AuditLog = require('../../../src/models/log/AuditLog');
const adminUserService = require('../../../src/services/admin/user.service');

beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => { await db.clear(); f.resetSeq(); });

const STRONG_PASSWORD = 'correct-horse-battery';

describe('Role promotion guards', () => {
  test('a normal user cannot be promoted to admin', async () => {
    const admin = await f.createUser({ role: 'admin' });
    const victim = await f.createUser({ role: 'user' });

    await expect(adminUserService.update(admin, victim._id, { role: 'admin' }))
      .rejects.toMatchObject({ statusCode: 403, errorCode: 'ADMIN_PROVISIONING_FORBIDDEN' });

    expect((await User.findById(victim._id)).role).toBe('user');
  });

  test('an admin account cannot be re-declared admin through update either', async () => {
    const admin = await f.createUser({ role: 'admin' });
    const other = await f.createUser({ role: 'admin' });

    await expect(adminUserService.update(admin, other._id, { role: 'admin' }))
      .rejects.toMatchObject({ statusCode: 403 });
  });

  test('an admin account role stays immutable', async () => {
    const admin = await f.createUser({ role: 'admin' });
    const target = await f.createUser({ role: 'admin' });

    await expect(adminUserService.update(admin, target._id, { role: 'user' }))
      .rejects.toMatchObject({ errorCode: 'ADMIN_ROLE_IMMUTABLE' });
  });

  test('creating an admin through the service is refused', async () => {
    const admin = await f.createUser({ role: 'admin' });

    await expect(adminUserService.create(admin, {
      email: 'newadmin@test.com',
      password: STRONG_PASSWORD,
      fullName: 'New Admin',
      role: 'admin',
    })).rejects.toMatchObject({ statusCode: 403, errorCode: 'ADMIN_PROVISIONING_FORBIDDEN' });

    expect(await User.findOne({ email: 'newadmin@test.com' })).toBeNull();
  });
});

describe('Existing assignment workflow is retained', () => {
  test('staff and manager roles still route through the assignment endpoints', async () => {
    const admin = await f.createUser({ role: 'admin' });
    const target = await f.createUser({ role: 'user' });

    await expect(adminUserService.update(admin, target._id, { role: 'staff' }))
      .rejects.toMatchObject({ errorCode: 'USE_ASSIGNMENT_ENDPOINT' });
    await expect(adminUserService.update(admin, target._id, { role: 'manager' }))
      .rejects.toMatchObject({ errorCode: 'USE_ASSIGNMENT_ENDPOINT' });
  });

  test('a normal profile update still succeeds and is audited', async () => {
    const admin = await f.createUser({ role: 'admin' });
    const target = await f.createUser({ role: 'user' });

    const updated = await adminUserService.update(admin, target._id, { fullName: 'Renamed' });

    expect(updated.fullName).toBe('Renamed');
    expect(await AuditLog.countDocuments({ action: 'UPDATE_USER', targetId: target._id })).toBe(1);
  });

  test('creating a normal user still works and is audited', async () => {
    const admin = await f.createUser({ role: 'admin' });

    const created = await adminUserService.create(admin, {
      email: 'staffcandidate@test.com',
      password: STRONG_PASSWORD,
      fullName: 'Candidate',
    });

    expect(created.role).toBe('user');
    expect(await AuditLog.countDocuments({ action: 'CREATE_USER', targetId: created._id })).toBe(1);
  });
});
