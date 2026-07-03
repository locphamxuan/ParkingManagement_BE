/** buildingManager.service — gán/thu hồi manager & staff, đồng bộ role + assignedBuildings. */
const db = require('../helpers/db');
const f = require('../helpers/fixtures');
const svc = require('../../src/services/buildingManager.service');
const User = require('../../src/models/user/User');
const Building = require('../../src/models/building/Building');

let building;
beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => { await db.clear(); building = await f.createBuilding(); });

describe('manager assignment', () => {
  test('gán manager: role→manager, building.manager set, assignedBuildings đồng bộ', async () => {
    const u = await f.createUser({ role: 'user' });
    await svc.assignManagerToBuilding({ buildingId: building._id, userId: u._id });
    const fresh = await User.findById(u._id);
    expect(fresh.role).toBe('manager');
    expect(fresh.assignedBuildings.map(String)).toContain(String(building._id));
    const b = await Building.findById(building._id);
    expect(String(b.manager)).toBe(String(u._id));
  });

  test('tòa đã có manager khác → 400', async () => {
    const m1 = await f.createUser({ role: 'user' });
    await svc.assignManagerToBuilding({ buildingId: building._id, userId: m1._id });
    const m2 = await f.createUser({ role: 'user' });
    await expect(svc.assignManagerToBuilding({ buildingId: building._id, userId: m2._id }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  test('gán staff hiện tại làm manager → 400 (revoke staff trước)', async () => {
    const u = await f.createUser({ role: 'user' });
    await svc.assignStaffToBuilding({ buildingId: building._id, userId: u._id });
    await expect(svc.assignManagerToBuilding({ buildingId: building._id, userId: u._id }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  test('revoke manager: role→user, building.manager null', async () => {
    const u = await f.createUser({ role: 'user' });
    await svc.assignManagerToBuilding({ buildingId: building._id, userId: u._id });
    await svc.revokeManagerFromBuilding({ buildingId: building._id, userId: u._id });
    const fresh = await User.findById(u._id);
    expect(fresh.role).toBe('user');
    const b = await Building.findById(building._id);
    expect(b.manager).toBeNull();
  });
});

describe('staff assignment', () => {
  test('gán staff: role→staff, assignedBuildings đồng bộ', async () => {
    const u = await f.createUser({ role: 'user' });
    await svc.assignStaffToBuilding({ buildingId: building._id, userId: u._id });
    const fresh = await User.findById(u._id);
    expect(fresh.role).toBe('staff');
    expect(fresh.assignedBuildings.map(String)).toContain(String(building._id));
  });

  test('1 user chỉ thuộc 1 tòa: gán tòa thứ 2 → 400', async () => {
    const u = await f.createUser({ role: 'user' });
    await svc.assignStaffToBuilding({ buildingId: building._id, userId: u._id });
    const b2 = await f.createBuilding();
    await expect(svc.assignStaffToBuilding({ buildingId: b2._id, userId: u._id }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  test('revoke staff cuối cùng → role về user', async () => {
    const u = await f.createUser({ role: 'user' });
    await svc.assignStaffToBuilding({ buildingId: building._id, userId: u._id });
    await svc.revokeStaffFromBuilding({ buildingId: building._id, userId: u._id });
    const fresh = await User.findById(u._id);
    expect(fresh.role).toBe('user');
    expect(fresh.assignedBuildings).toHaveLength(0);
  });

  test('getBuildingMembers trả manager + danh sách staff', async () => {
    const m = await f.createUser({ role: 'user' });
    const s = await f.createUser({ role: 'user' });
    await svc.assignManagerToBuilding({ buildingId: building._id, userId: m._id });
    await svc.assignStaffToBuilding({ buildingId: building._id, userId: s._id });
    const members = await svc.getBuildingMembers(building._id);
    expect(String(members.manager._id)).toBe(String(m._id));
    expect(members.staff).toHaveLength(1);
  });
});
