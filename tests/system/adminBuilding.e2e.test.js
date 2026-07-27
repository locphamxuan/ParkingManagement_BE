/**
 * SYSTEM / E2E — admin building CRUD + assign/revoke manager/staff qua HTTP thật
 * (supertest → app → auth/RBAC → validator → controller → service → DB).
 * Trước đây các route này chỉ được test gián tiếp qua service
 * (buildingManager.service.test.js) — route/validator/RBAC layer chưa ai chạy qua.
 * Cũng phủ luôn field-whitelist chống mass assignment ở building.service.js.
 */
const request = require('supertest');
const app = require('../../src/app');
const db = require('../helpers/db');
const f = require('../helpers/fixtures');
const { signToken } = require('../../src/utils/token');
const Building = require('../../src/models/building/Building');
const User = require('../../src/models/user/User');

const bearer = (token) => `Bearer ${token}`;

beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => { await db.clear(); f.resetSeq(); });

const validPayload = (over = {}) => ({
  name: 'Toa nha A',
  code: 'BLD-A',
  totalFloors: 3,
  pricing: { hourlyRate: 10000 },
  operatingHours: { open: '06:00', close: '22:00' },
  ...over,
});

describe('E2E · Admin building routes (HTTP)', () => {
  test('không token → 401', async () => {
    const res = await request(app).get('/api/admin/buildings');
    expect(res.status).toBe(401);
  });

  test('token role khác admin → 403', async () => {
    const staff = await f.createUser({ role: 'staff', password: 'secret1' });
    const res = await request(app)
      .get('/api/admin/buildings')
      .set('Authorization', bearer(signToken(staff._id)));
    expect(res.status).toBe(403);
  });

  test('POST tạo building hợp lệ → 201 + trả đúng field', async () => {
    const admin = await f.createUser({ role: 'admin', password: 'secret1' });
    const res = await request(app)
      .post('/api/admin/buildings')
      .set('Authorization', bearer(signToken(admin._id)))
      .send(validPayload());

    expect(res.status).toBe(201);
    expect(res.body.data.building.code).toBe('BLD-A');
  });

  test('POST thiếu pricing.hourlyRate → 400 (validator chặn trước khi tới service)', async () => {
    const admin = await f.createUser({ role: 'admin', password: 'secret1' });
    const payload = validPayload();
    delete payload.pricing;

    const res = await request(app)
      .post('/api/admin/buildings')
      .set('Authorization', bearer(signToken(admin._id)))
      .send(payload);

    expect(res.status).toBe(400);
  });

  test('POST kèm field lạ (manager/isActive/status) → bị loại bỏ, không mass-assign', async () => {
    const admin = await f.createUser({ role: 'admin', password: 'secret1' });
    const other = await f.createUser({ role: 'user' });

    const res = await request(app)
      .post('/api/admin/buildings')
      .set('Authorization', bearer(signToken(admin._id)))
      .send(validPayload({ manager: String(other._id), isActive: false, status: 'maintenance' }));

    expect(res.status).toBe(201);
    const created = await Building.findById(res.body.data.building._id);
    expect(created.manager).toBeNull();
    expect(created.isActive).toBe(true);
    expect(created.status).toBe('active');
  });

  test('PUT update kèm field lạ (manager) → không đổi manager qua đường này', async () => {
    const admin = await f.createUser({ role: 'admin', password: 'secret1' });
    const other = await f.createUser({ role: 'user' });
    const building = await f.createBuilding();

    const res = await request(app)
      .put(`/api/admin/buildings/${building._id}`)
      .set('Authorization', bearer(signToken(admin._id)))
      .send({ name: 'Renamed', manager: String(other._id) });

    expect(res.status).toBe(200);
    expect(res.body.data.building.name).toBe('Renamed');
    expect((await Building.findById(building._id)).manager).toBeNull();
  });

  test('PATCH status hợp lệ → 200; status không hợp lệ → 400', async () => {
    const admin = await f.createUser({ role: 'admin', password: 'secret1' });
    const building = await f.createBuilding();

    const ok = await request(app)
      .patch(`/api/admin/buildings/${building._id}/status`)
      .set('Authorization', bearer(signToken(admin._id)))
      .send({ status: 'maintenance' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.building.status).toBe('maintenance');

    const bad = await request(app)
      .patch(`/api/admin/buildings/${building._id}/status`)
      .set('Authorization', bearer(signToken(admin._id)))
      .send({ status: 'not-a-status' });
    expect(bad.status).toBe(400);
  });

  test('DELETE building không tồn tại → 404', async () => {
    const admin = await f.createUser({ role: 'admin', password: 'secret1' });
    const res = await request(app)
      .delete('/api/admin/buildings/000000000000000000000000')
      .set('Authorization', bearer(signToken(admin._id)));
    expect(res.status).toBe(404);
  });

  test('assign-manager → 201, sau đó revoke-manager → user role về "user"', async () => {
    const admin = await f.createUser({ role: 'admin', password: 'secret1' });
    const building = await f.createBuilding();
    const target = await f.createUser({ role: 'user' });

    const assignRes = await request(app)
      .post(`/api/admin/buildings/${building._id}/assign-manager`)
      .set('Authorization', bearer(signToken(admin._id)))
      .send({ userId: String(target._id) });
    expect(assignRes.status).toBe(201);
    expect((await User.findById(target._id)).role).toBe('manager');

    const revokeRes = await request(app)
      .post(`/api/admin/buildings/${building._id}/revoke-manager`)
      .set('Authorization', bearer(signToken(admin._id)))
      .send({ userId: String(target._id) });
    expect(revokeRes.status).toBe(200);
    expect((await User.findById(target._id)).role).toBe('user');
  });

  test('assign-manager thiếu userId → 400', async () => {
    const admin = await f.createUser({ role: 'admin', password: 'secret1' });
    const building = await f.createBuilding();

    const res = await request(app)
      .post(`/api/admin/buildings/${building._id}/assign-manager`)
      .set('Authorization', bearer(signToken(admin._id)))
      .send({});
    expect(res.status).toBe(400);
  });

  test('assign-staff rồi assign lại làm manager building khác → 400 (ràng buộc 1 người : 1 toà)', async () => {
    const admin = await f.createUser({ role: 'admin', password: 'secret1' });
    const buildingA = await f.createBuilding();
    const buildingB = await f.createBuilding();
    const target = await f.createUser({ role: 'user' });

    const assignRes = await request(app)
      .post(`/api/admin/buildings/${buildingA._id}/assign-staff`)
      .set('Authorization', bearer(signToken(admin._id)))
      .send({ userId: String(target._id) });
    expect(assignRes.status).toBe(201);
    expect((await User.findById(target._id)).role).toBe('staff');

    const conflictRes = await request(app)
      .post(`/api/admin/buildings/${buildingB._id}/assign-manager`)
      .set('Authorization', bearer(signToken(admin._id)))
      .send({ userId: String(target._id) });
    expect(conflictRes.status).toBe(400);
  });

  test('non-admin gọi assign-manager → 403 (RBAC chặn ở route, không tới controller)', async () => {
    const manager = await f.createUser({ role: 'manager', password: 'secret1' });
    const building = await f.createBuilding();
    const target = await f.createUser({ role: 'user' });

    const res = await request(app)
      .post(`/api/admin/buildings/${building._id}/assign-manager`)
      .set('Authorization', bearer(signToken(manager._id)))
      .send({ userId: String(target._id) });
    expect(res.status).toBe(403);
  });
});
