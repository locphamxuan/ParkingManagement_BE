/**
 * A stolen JWT must die at logout / password reset, not seven days later.
 */
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../../../src/app');
const db = require('../../helpers/db');
const f = require('../../helpers/fixtures');
const env = require('../../../src/config/env');
const { resetLimiters } = require('../../helpers/rateLimit');
const { authLimiter, passwordResetLimiter } = require('../../../src/middlewares/rateLimiter');
const { signToken } = require('../../../src/utils/token');
const { COOKIE_NAME } = require('../../../src/utils/authCookie');
const User = require('../../../src/models/user/User');
const PhoneOtp = require('../../../src/models/user/PhoneOtp');

jest.mock('../../../src/utils/email', () => ({
  sendOtpEmail: jest.fn().mockResolvedValue(undefined),
  sendResetPasswordEmail: jest.fn().mockResolvedValue(undefined),
}));

beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.clear();
  f.resetSeq();
  await resetLimiters(authLimiter, passwordResetLimiter);
});

const ORIGIN = 'http://localhost:5173';
const STRONG_PASSWORD = 'correct-horse-battery';
const OLD_PASSWORD = 'secret1';
const hashOtp = (otp) => crypto.createHash('sha256').update(otp).digest('hex');

const getMe = (token) =>
  request(app).get('/api/users/auth/me').set('Authorization', `Bearer ${token}`);

describe('Token version claim', () => {
  test('a newly signed token carries the current version and is accepted', async () => {
    const user = await f.createUser();
    const decoded = jwt.verify(signToken(user), env.jwtSecret);

    expect(decoded.tv).toBe(0);
    expect((await getMe(signToken(user))).status).toBe(200);
  });

  test('a token with no version claim is rejected', async () => {
    const user = await f.createUser();
    const legacyToken = jwt.sign({ id: user._id }, env.jwtSecret, { expiresIn: '7d' });

    const res = await getMe(legacyToken);

    expect(res.status).toBe(401);
    expect(res.body.errorCode).toBe('TOKEN_REVOKED');
  });

  test('a token with a stale version is rejected', async () => {
    const user = await f.createUser();
    const staleToken = jwt.sign({ id: user._id, tv: 0 }, env.jwtSecret, { expiresIn: '7d' });
    await User.updateOne({ _id: user._id }, { tokenVersion: 3 });

    expect((await getMe(staleToken)).status).toBe(401);
  });
});

describe('Logout', () => {
  test('requires authentication, still clears the cookie, and revokes the token', async () => {
    const user = await f.createUser({ password: OLD_PASSWORD });
    const login = await request(app)
      .post('/api/users/auth/login')
      .send({ email: user.email, password: OLD_PASSWORD });
    const token = login.body.data.token;
    const cookie = login.headers['set-cookie'].find((c) => c.startsWith(`${COOKIE_NAME}=`));

    expect((await getMe(token)).status).toBe(200);

    const logout = await request(app)
      .post('/api/users/auth/logout')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie);

    expect(logout.status).toBe(200);
    expect((logout.headers['set-cookie'] || []).some((c) => c.startsWith(`${COOKIE_NAME}=;`))).toBe(true);
    expect((await getMe(token)).status).toBe(401);
  });

  test('an unauthenticated logout is rejected but still clears the cookie', async () => {
    const res = await request(app).post('/api/users/auth/logout').set('Origin', ORIGIN);

    expect(res.status).toBe(401);
    expect((res.headers['set-cookie'] || []).some((c) => c.startsWith(`${COOKIE_NAME}=;`))).toBe(true);
  });
});

describe('Credential resets revoke existing tokens', () => {
  test('authenticated password change', async () => {
    const user = await f.createUser({ password: OLD_PASSWORD });
    const oldToken = signToken(user);

    const res = await request(app)
      .put('/api/users/profile/password')
      .set('Authorization', `Bearer ${oldToken}`)
      .send({ currentPassword: OLD_PASSWORD, newPassword: STRONG_PASSWORD });

    expect(res.status).toBe(200);
    expect((await getMe(oldToken)).status).toBe(401);

    const relogin = await request(app)
      .post('/api/users/auth/login')
      .send({ email: user.email, password: STRONG_PASSWORD });
    expect((await getMe(relogin.body.data.token)).status).toBe(200);
  });

  test('email reset-password issues a token with the new version', async () => {
    const user = await f.createUser({ password: OLD_PASSWORD });
    const oldToken = signToken(user);
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.resetPasswordExpires = new Date(Date.now() + 60_000);
    await user.save({ validateModifiedOnly: true });

    const res = await request(app)
      .post('/api/users/auth/reset-password')
      .send({ token: resetToken, newPassword: STRONG_PASSWORD });

    expect(res.status).toBe(200);
    expect((await getMe(oldToken)).status).toBe(401);
    expect((await getMe(res.body.data.token)).status).toBe(200);
  });

  test('SMS reset-password issues a token with the new version', async () => {
    const user = await f.createUser({ password: OLD_PASSWORD, phone: '0900000222' });
    const oldToken = signToken(user);
    await PhoneOtp.create({
      phone: user.phone,
      otpHash: hashOtp('123456'),
      purpose: 'password_reset',
      expiresAt: new Date(Date.now() + 60_000),
    });

    const res = await request(app)
      .post('/api/users/auth/reset-password-sms')
      .send({ phone: user.phone, otp: '123456', newPassword: STRONG_PASSWORD });

    expect(res.status).toBe(200);
    expect((await getMe(oldToken)).status).toBe(401);
    expect((await getMe(res.body.data.token)).status).toBe(200);
  });
});

describe('Backward compatibility', () => {
  test('a document written before tokenVersion existed is treated as version 0', async () => {
    const user = await f.createUser();
    await User.collection.updateOne({ _id: user._id }, { $unset: { tokenVersion: '' } });

    const raw = await User.collection.findOne({ _id: user._id });
    expect(raw.tokenVersion).toBeUndefined();

    const hydrated = await User.findById(user._id);
    expect((await getMe(signToken(hydrated))).status).toBe(200);
  });
});
