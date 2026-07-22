/**
 * SYSTEM / E2E — auth qua httpOnly cookie (thay localStorage-readable token cho
 * web). Login/register/register-verify phải set cookie `token` httpOnly; logout
 * phải xoá nó; middleware phải chấp nhận CẢ cookie (web) LẪN header Bearer
 * (Mobile, không có cookie jar) trên cùng 1 request.
 */
const request = require('supertest');
const app = require('../../src/app');
const db = require('../helpers/db');
const f = require('../helpers/fixtures');
const { signToken } = require('../../src/utils/token');

beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => { await db.clear(); f.resetSeq(); });

/** Extract the `token=...` cookie's attribute string from a Set-Cookie array. */
const findTokenCookie = (res) =>
  (res.headers['set-cookie'] || []).find((c) => c.startsWith('token='));

describe('E2E · Auth httpOnly cookie', () => {
  test('login → Set-Cookie token httpOnly, KHÔNG lộ qua JS (không có Secure ở dev, có HttpOnly)', async () => {
    await f.createUser({ email: 'cookie@test.com', password: 'secret1' });

    const res = await request(app)
      .post('/api/users/auth/login')
      .send({ email: 'cookie@test.com', password: 'secret1' });

    expect(res.status).toBe(200);
    const cookie = findTokenCookie(res);
    expect(cookie).toBeTruthy();
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    // Body vẫn trả token (Mobile cần) — cookie chỉ là kênh bổ sung cho web.
    expect(res.body.data.token).toBeTruthy();
  });

  test('cookie login đủ để gọi API cần auth mà KHÔNG cần header Authorization', async () => {
    await f.createUser({ email: 'cookie2@test.com', password: 'secret1' });
    const agent = request.agent(app); // giữ cookie jar giữa các request như trình duyệt thật

    const loginRes = await agent
      .post('/api/users/auth/login')
      .send({ email: 'cookie2@test.com', password: 'secret1' });
    expect(loginRes.status).toBe(200);

    const meRes = await agent.get('/api/users/auth/me'); // không set header Authorization
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.user.email).toBe('cookie2@test.com');
  });

  test('logout → clearCookie, request sau đó (không header) bị 401', async () => {
    await f.createUser({ email: 'cookie3@test.com', password: 'secret1' });
    const agent = request.agent(app);
    await agent.post('/api/users/auth/login').send({ email: 'cookie3@test.com', password: 'secret1' });

    const logoutRes = await agent.post('/api/users/auth/logout');
    expect(logoutRes.status).toBe(200);
    const cleared = findTokenCookie(logoutRes);
    expect(cleared).toMatch(/token=;/); // clearCookie ghi đè rỗng + hết hạn

    const meRes = await agent.get('/api/users/auth/me');
    expect(meRes.status).toBe(401);
  });

  test('register → cũng set cookie token (không chỉ login)', async () => {
    const res = await request(app)
      .post('/api/users/auth/register')
      .send({ email: 'newreg@test.com', password: 'secret1', fullName: 'New Reg' });

    expect(res.status).toBe(201);
    expect(findTokenCookie(res)).toBeTruthy();
  });

  test('Mobile-style: chỉ header Bearer, không cookie → vẫn xác thực được', async () => {
    const user = await f.createUser({ email: 'mobile@test.com', password: 'secret1' });
    const res = await request(app)
      .get('/api/users/auth/me')
      .set('Authorization', `Bearer ${signToken(user._id)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe('mobile@test.com');
  });

  test('không cookie, không header → 401', async () => {
    const res = await request(app).get('/api/users/auth/me');
    expect(res.status).toBe(401);
  });
});
