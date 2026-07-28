/**
 * One server-side policy, applied to every flow that sets a password.
 * The server is authoritative — clients only mirror the message.
 */
const crypto = require('node:crypto');
const request = require('supertest');
const app = require('../../../src/app');
const db = require('../../helpers/db');
const f = require('../../helpers/fixtures');
const { resetLimiters } = require('../../helpers/rateLimit');
const {
  authLimiter,
  passwordResetLimiter,
  registrationOtpLimiter,
} = require('../../../src/middlewares/rateLimiter');
const { signToken } = require('../../../src/utils/token');
const { findPasswordWeakness } = require('../../../src/utils/passwordPolicy');
const User = require('../../../src/models/user/User');
const PhoneOtp = require('../../../src/models/user/PhoneOtp');
const adminUserService = require('../../../src/services/admin/user.service');

jest.mock('../../../src/utils/email', () => ({
  sendOtpEmail: jest.fn().mockResolvedValue(undefined),
  sendResetPasswordEmail: jest.fn().mockResolvedValue(undefined),
}));
const { sendOtpEmail } = require('../../../src/utils/email');

beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.clear();
  f.resetSeq();
  await resetLimiters(authLimiter, passwordResetLimiter, registrationOtpLimiter);
});

const WEAK_PASSWORDS = ['123456', 'password', 'Password123', 'short', 'aaaaaaaaaaaa', '123456789012', 'admin123'];
const STRONG_PASSWORD = 'correct-horse-battery';
const ORIGIN = 'http://localhost:5173';
const hashOtp = (otp) => crypto.createHash('sha256').update(otp).digest('hex');

describe('Password policy unit rules', () => {
  test.each(WEAK_PASSWORDS)('rejects %s', (password) => {
    expect(findPasswordWeakness(password)).toBeTruthy();
  });

  test.each(['correct-horse-battery', 'Tr0ub4dor&3xyz!', 'parking-lot-gate-42'])('accepts %s', (password) => {
    expect(findPasswordWeakness(password)).toBeNull();
  });

  test('requires at least 12 characters', () => {
    expect(findPasswordWeakness('Abcd3fgh!jk')).toBeTruthy();
    expect(findPasswordWeakness('Abcd3fgh!jkl')).toBeNull();
  });
});

describe('OTP registration verification', () => {
  test.each(WEAK_PASSWORDS)('rejects %s', async (password) => {
    await request(app)
      .post('/api/users/auth/register-request')
      .send({ email: 'pol@test.com', fullName: 'Policy' });
    const otp = sendOtpEmail.mock.calls.at(-1)[0].otp;

    const res = await request(app)
      .post('/api/users/auth/register-verify')
      .send({ email: 'pol@test.com', otp, password });

    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('WEAK_PASSWORD');
    expect(await User.findOne({ email: 'pol@test.com' })).toBeNull();
  });
});

describe('Email reset-password', () => {
  test.each(WEAK_PASSWORDS)('rejects %s', async (password) => {
    const user = await f.createUser();
    const token = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = crypto.createHash('sha256').update(token).digest('hex');
    user.resetPasswordExpires = new Date(Date.now() + 60_000);
    await user.save({ validateModifiedOnly: true });

    const res = await request(app)
      .post('/api/users/auth/reset-password')
      .send({ token, newPassword: password });

    expect(res.status).toBe(400);
  });
});

describe('SMS reset-password', () => {
  test.each(WEAK_PASSWORDS)('rejects %s', async (password) => {
    const user = await f.createUser({ phone: '0900000111' });
    await PhoneOtp.create({
      phone: user.phone,
      otpHash: hashOtp('123456'),
      purpose: 'password_reset',
      expiresAt: new Date(Date.now() + 60_000),
    });

    const res = await request(app)
      .post('/api/users/auth/reset-password-sms')
      .send({ phone: user.phone, otp: '123456', newPassword: password });

    expect(res.status).toBe(400);
  });
});

describe('Authenticated change-password', () => {
  test.each(WEAK_PASSWORDS)('rejects %s', async (password) => {
    const user = await f.createUser({ password: 'secret1' });

    const res = await request(app)
      .put('/api/users/profile/password')
      .set('Authorization', `Bearer ${signToken(user)}`)
      .set('Origin', ORIGIN)
      .send({ currentPassword: 'secret1', newPassword: password });

    expect(res.status).toBe(400);
  });

  test('accepts a strong password', async () => {
    const user = await f.createUser({ password: 'secret1' });

    const res = await request(app)
      .put('/api/users/profile/password')
      .set('Authorization', `Bearer ${signToken(user)}`)
      .send({ currentPassword: 'secret1', newPassword: STRONG_PASSWORD });

    expect(res.status).toBe(200);
  });
});

describe('Admin user creation', () => {
  test.each(WEAK_PASSWORDS)('rejects %s', async (password) => {
    const admin = await f.createUser({ role: 'admin' });

    await expect(
      adminUserService.create(admin, {
        email: `weak${Math.random()}@test.com`,
        password,
        fullName: 'Weak',
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('Existing users keep working', () => {
  test('a pre-policy short password still logs in', async () => {
    const user = await f.createUser({ password: 'secret1' });

    const res = await request(app)
      .post('/api/users/auth/login')
      .send({ email: user.email, password: 'secret1' });

    expect(res.status).toBe(200);
  });
});
