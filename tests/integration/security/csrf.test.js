/**
 * The auth cookie is SameSite=None, so the browser attaches it to cross-site
 * requests. CORS hides the response but does not stop the write — these tests
 * pin the server-side Origin guard, and pin that native Bearer clients (which
 * send no Origin at all) are unaffected.
 */
const request = require('supertest');
const app = require('../../../src/app');
const db = require('../../helpers/db');
const f = require('../../helpers/fixtures');
const { resetLimiters } = require('../../helpers/rateLimit');
const { authLimiter } = require('../../../src/middlewares/rateLimiter');
const { signToken } = require('../../../src/utils/token');
const { COOKIE_NAME } = require('../../../src/utils/authCookie');
const User = require('../../../src/models/user/User');

beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => { await db.clear(); f.resetSeq(); await resetLimiters(authLimiter); });

const ALLOWED_ORIGIN = 'http://localhost:5173';
const HOSTILE_ORIGIN = 'https://evil.example.com';
const WRITE_PATH = '/api/users/profile';

const cookieFor = (user) => `${COOKIE_NAME}=${signToken(user)}`;

describe('Cookie-authenticated writes', () => {
  test('are allowed from the configured web origin', async () => {
    const user = await f.createUser();

    const res = await request(app)
      .put(WRITE_PATH)
      .set('Origin', ALLOWED_ORIGIN)
      .set('Cookie', cookieFor(user))
      .send({ fullName: 'Legit Update' });

    expect(res.status).toBe(200);
  });

  test('are blocked from a hostile origin', async () => {
    const user = await f.createUser({ fullName: 'Untouched' });

    const res = await request(app)
      .put(WRITE_PATH)
      .set('Origin', HOSTILE_ORIGIN)
      .set('Cookie', cookieFor(user))
      .send({ fullName: 'Attacker Update' });

    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('CSRF_ORIGIN_DENIED');
    expect((await User.findById(user._id)).fullName).toBe('Untouched');
  });

  test('are blocked when Origin is missing entirely', async () => {
    const user = await f.createUser();

    const res = await request(app)
      .put(WRITE_PATH)
      .set('Cookie', cookieFor(user))
      .send({ fullName: 'No Origin' });

    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('CSRF_ORIGIN_MISSING');
  });

  test('are blocked when Origin is malformed', async () => {
    const user = await f.createUser();

    const res = await request(app)
      .put(WRITE_PATH)
      .set('Origin', 'not-a-url')
      .set('Cookie', cookieFor(user))
      .send({ fullName: 'Bad Origin' });

    expect(res.status).toBe(403);
  });

  test('fall back to a valid Referer when Origin is absent', async () => {
    const user = await f.createUser();

    const res = await request(app)
      .put(WRITE_PATH)
      .set('Referer', `${ALLOWED_ORIGIN}/profile`)
      .set('Cookie', cookieFor(user))
      .send({ fullName: 'Referer Fallback' });

    expect(res.status).toBe(200);
  });

  test('reject a hostile Referer', async () => {
    const user = await f.createUser();

    const res = await request(app)
      .put(WRITE_PATH)
      .set('Referer', `${HOSTILE_ORIGIN}/attack`)
      .set('Cookie', cookieFor(user))
      .send({ fullName: 'Bad Referer' });

    expect(res.status).toBe(403);
  });

  test('reject form-urlencoded bodies even from an allowed origin', async () => {
    const user = await f.createUser();

    const res = await request(app)
      .put(WRITE_PATH)
      .set('Origin', ALLOWED_ORIGIN)
      .set('Cookie', cookieFor(user))
      .type('form')
      .send({ fullName: 'Form Post' });

    expect(res.status).toBe(415);
    expect(res.body.errorCode).toBe('UNSUPPORTED_CONTENT_TYPE');
  });

  test('classic cross-origin form CSRF is blocked before content-type matters', async () => {
    const user = await f.createUser();

    const res = await request(app)
      .put(WRITE_PATH)
      .set('Origin', HOSTILE_ORIGIN)
      .set('Cookie', cookieFor(user))
      .type('form')
      .send({ fullName: 'Form CSRF' });

    expect(res.status).toBe(403);
  });
});

describe('Reads and non-cookie callers are unaffected', () => {
  test('native Bearer writes succeed with no Origin header', async () => {
    const user = await f.createUser();

    const res = await request(app)
      .put(WRITE_PATH)
      .set('Authorization', `Bearer ${signToken(user)}`)
      .send({ fullName: 'Mobile Update' });

    expect(res.status).toBe(200);
  });

  test('a Bearer header wins even when a stale cookie is attached', async () => {
    const user = await f.createUser();

    const res = await request(app)
      .put(WRITE_PATH)
      .set('Authorization', `Bearer ${signToken(user)}`)
      .set('Cookie', `${COOKIE_NAME}=stale-token`)
      .send({ fullName: 'Bearer Wins' });

    expect(res.status).toBe(200);
  });

  test('cookie-authenticated GETs are never blocked', async () => {
    const user = await f.createUser();

    const res = await request(app).get('/api/users/auth/me').set('Cookie', cookieFor(user));

    expect(res.status).toBe(200);
  });

  test('unauthenticated writes are not blocked by the CSRF guard', async () => {
    const res = await request(app)
      .post('/api/users/auth/login')
      .send({ email: 'nobody@test.com', password: 'whatever12345' });

    expect(res.status).toBe(401);
  });

  test('the PayOS webhook (server-to-server, no cookie) still reaches its handler', async () => {
    const res = await request(app)
      .post('/api/payments/webhook')
      .send({ code: '00', desc: 'success', data: { orderCode: 424242 } });

    expect(res.status).not.toBe(403);
  });
});
