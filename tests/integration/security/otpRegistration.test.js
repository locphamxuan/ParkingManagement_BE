/**
 * Email-registration OTP: no plaintext password or OTP at rest, capped attempts,
 * and a password that only ever arrives in the final verified request.
 */
const crypto = require('node:crypto');
const request = require('supertest');
const app = require('../../../src/app');
const db = require('../../helpers/db');
const f = require('../../helpers/fixtures');
const OtpVerification = require('../../../src/models/user/OtpVerification');
const User = require('../../../src/models/user/User');

jest.mock('../../../src/utils/email', () => ({
  sendOtpEmail: jest.fn().mockResolvedValue(undefined),
  sendResetPasswordEmail: jest.fn().mockResolvedValue(undefined),
}));
const { sendOtpEmail } = require('../../../src/utils/email');

const { resetLimiters } = require('../../helpers/rateLimit');
const { registrationOtpLimiter, authLimiter } = require('../../../src/middlewares/rateLimiter');

beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.clear();
  f.resetSeq();
  await resetLimiters(registrationOtpLimiter, authLimiter);
});

const STRONG_PASSWORD = 'correct-horse-battery';
const EMAIL = 'newuser@test.com';

const lastOtp = () => sendOtpEmail.mock.calls.at(-1)[0].otp;

const requestOtp = (over = {}) =>
  request(app)
    .post('/api/users/auth/register-request')
    .send({ email: EMAIL, fullName: 'New User', ...over });

const verify = (body) =>
  request(app).post('/api/users/auth/register-verify').send({ email: EMAIL, ...body });

describe('OTP record contents', () => {
  test('stores neither a plaintext password nor a plaintext OTP', async () => {
    const res = await requestOtp();
    expect(res.status).toBe(200);

    const record = await OtpVerification.findOne({ email: EMAIL }).lean();
    const otp = lastOtp();

    expect(record).toBeTruthy();
    expect(record.password).toBeUndefined();
    expect(record.otp).toBeUndefined();
    expect(record.otpHash).toBe(crypto.createHash('sha256').update(otp).digest('hex'));
    expect(JSON.stringify(record)).not.toContain(otp);
    expect(JSON.stringify(record)).not.toContain(STRONG_PASSWORD);
    expect(record.attempts).toBe(0);
  });

  test('a password sent to register-request is discarded, not persisted', async () => {
    await requestOtp({ password: STRONG_PASSWORD });

    const record = await OtpVerification.findOne({ email: EMAIL }).lean();
    expect(JSON.stringify(record)).not.toContain(STRONG_PASSWORD);
  });

  test('keeps the five-minute expiry', async () => {
    await requestOtp();
    const record = await OtpVerification.findOne({ email: EMAIL }).lean();
    const ttlMs = record.expiresAt.getTime() - Date.now();
    expect(ttlMs).toBeGreaterThan(4 * 60 * 1000);
    expect(ttlMs).toBeLessThanOrEqual(5 * 60 * 1000);
  });
});

describe('OTP verification', () => {
  test('succeeds once and bcrypts the password supplied at verify time', async () => {
    await requestOtp();
    const otp = lastOtp();

    const res = await verify({ otp, password: STRONG_PASSWORD });

    expect(res.status).toBe(201);
    expect(res.body.data.token).toBeTruthy();

    const user = await User.findOne({ email: EMAIL }).select('+password');
    expect(user.password).not.toBe(STRONG_PASSWORD);
    expect(await user.comparePassword(STRONG_PASSWORD)).toBe(true);

    // Record consumed — the same OTP cannot be replayed.
    expect(await OtpVerification.findOne({ email: EMAIL })).toBeNull();
    const replay = await verify({ otp, password: STRONG_PASSWORD });
    expect(replay.status).toBe(400);
  });

  test('rejects a verify request with no password', async () => {
    await requestOtp();
    const res = await verify({ otp: lastOtp() });

    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('WEAK_PASSWORD');
    expect(await User.findOne({ email: EMAIL })).toBeNull();
  });

  test('invalidates the record after five wrong attempts', async () => {
    await requestOtp();
    const otp = lastOtp();
    const wrongOtp = otp === '000000' ? '111111' : '000000';

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const res = await verify({ otp: wrongOtp, password: STRONG_PASSWORD });
      expect(res.status).toBe(400);
      const record = await OtpVerification.findOne({ email: EMAIL }).lean();
      expect(record.attempts).toBe(attempt);
    }

    const fifth = await verify({ otp: wrongOtp, password: STRONG_PASSWORD });
    expect(fifth.status).toBe(400);
    expect(fifth.body.errorCode).toBe('OTP_ATTEMPTS_EXCEEDED');
    expect(await OtpVerification.findOne({ email: EMAIL })).toBeNull();

    // Even the CORRECT code no longer works — a fresh OTP is required.
    const afterBurn = await verify({ otp, password: STRONG_PASSWORD });
    expect(afterBurn.status).toBe(400);
    expect(await User.findOne({ email: EMAIL })).toBeNull();
  });

  test('resend replaces the previous OTP and resets the attempt counter', async () => {
    await requestOtp();
    const firstOtp = lastOtp();
    await verify({ otp: firstOtp === '000000' ? '111111' : '000000', password: STRONG_PASSWORD });
    expect((await OtpVerification.findOne({ email: EMAIL }).lean()).attempts).toBe(1);

    await requestOtp();
    const secondOtp = lastOtp();
    expect(secondOtp).not.toBe(firstOtp);
    expect((await OtpVerification.findOne({ email: EMAIL }).lean()).attempts).toBe(0);
    expect(await OtpVerification.countDocuments({ email: EMAIL })).toBe(1);

    const stale = await verify({ otp: firstOtp, password: STRONG_PASSWORD });
    expect(stale.status).toBe(400);

    const fresh = await verify({ otp: secondOtp, password: STRONG_PASSWORD });
    expect(fresh.status).toBe(201);
  });

  test('an expired record cannot be verified', async () => {
    await requestOtp();
    const otp = lastOtp();
    await OtpVerification.updateOne({ email: EMAIL }, { expiresAt: new Date(Date.now() - 1000) });

    const res = await verify({ otp, password: STRONG_PASSWORD });

    expect(res.status).toBe(400);
    expect(await User.findOne({ email: EMAIL })).toBeNull();
  });
});

describe('Account-existence enumeration', () => {
  // Every assertion here compares against the SAME baseline response, so any
  // future divergence in status, body or timing-visible behaviour fails.
  const baseline = async () => {
    const res = await requestOtp({ email: 'brand-new@test.com' });
    return { status: res.status, body: res.body };
  };

  test('an already-registered email returns the same response as a new one', async () => {
    const expected = await baseline();
    await db.clear();
    await resetLimiters(registrationOtpLimiter);
    sendOtpEmail.mockClear();

    await f.createUser({ email: 'taken@test.com' });
    const res = await requestOtp({ email: 'taken@test.com' });

    // Byte-identical to the new-email response is the actual requirement.
    expect(res.status).toBe(expected.status);
    expect(res.body).toEqual(expected.body);
    expect(res.body.success).toBe(true);
    expect(res.body.errorCode).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('taken@test.com');
  });

  test('a phone already in use returns the same response as a new one', async () => {
    const expected = await baseline();
    await db.clear();
    await resetLimiters(registrationOtpLimiter);
    sendOtpEmail.mockClear();

    await f.createUser({ email: 'owner@test.com', phone: '0900000777' });
    const res = await requestOtp({ email: 'someone-else@test.com', phone: '0900000777' });

    expect(res.status).toBe(expected.status);
    expect(res.body).toEqual(expected.body);
    expect(res.body.errorCode).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('0900000777');
  });

  test('no OTP record is created and no email is sent for an existing email', async () => {
    await f.createUser({ email: 'taken@test.com' });

    await requestOtp({ email: 'taken@test.com' });

    expect(await OtpVerification.findOne({ email: 'taken@test.com' })).toBeNull();
    expect(sendOtpEmail).not.toHaveBeenCalled();
  });

  test('no OTP record is created and no email is sent for a used phone', async () => {
    await f.createUser({ email: 'owner@test.com', phone: '0900000777' });

    await requestOtp({ email: 'someone-else@test.com', phone: '0900000777' });

    expect(await OtpVerification.findOne({ email: 'someone-else@test.com' })).toBeNull();
    expect(sendOtpEmail).not.toHaveBeenCalled();
  });

  test('an existing OTP record is not overwritten by a request for a taken email', async () => {
    await requestOtp();
    const original = await OtpVerification.findOne({ email: EMAIL }).lean();

    await f.createUser({ email: EMAIL });
    await requestOtp();

    const after = await OtpVerification.findOne({ email: EMAIL }).lean();
    expect(after.otpHash).toBe(original.otpHash);
    expect(sendOtpEmail).toHaveBeenCalledTimes(1);
  });

  test('a brand-new email still receives an OTP and can complete registration', async () => {
    const res = await requestOtp();

    expect(res.status).toBe(200);
    expect(sendOtpEmail).toHaveBeenCalledTimes(1);

    const completed = await verify({ otp: lastOtp(), password: STRONG_PASSWORD });
    expect(completed.status).toBe(201);
    expect(await User.findOne({ email: EMAIL })).toBeTruthy();
  });

  test('register-verify still rejects a duplicate that appeared after the OTP was sent', async () => {
    await requestOtp();
    const otp = lastOtp();

    // Someone else registers the same address in the meantime.
    await f.createUser({ email: EMAIL });

    const res = await verify({ otp, password: STRONG_PASSWORD });
    expect(res.status).toBe(409);
  });

  test('malformed requests still fail loudly', async () => {
    expect((await requestOtp({ email: 'not-an-email' })).status).toBe(400);
    expect((await requestOtp({ fullName: '' })).status).toBe(400);
    expect((await requestOtp({ phone: 'abc' })).status).toBe(400);
  });
});

describe('OTP email flood protection', () => {
  test('successful register-request calls are counted, not skipped', async () => {
    for (let i = 0; i < 5; i += 1) {
      expect((await requestOtp({ email: `flood${i}@test.com` })).status).toBe(200);
    }

    const blocked = await requestOtp({ email: 'flood5@test.com' });

    expect(blocked.status).toBe(429);
    expect(sendOtpEmail).toHaveBeenCalledTimes(5);
  });
});

describe('Legacy direct registration', () => {
  test('cannot create an account', async () => {
    const res = await request(app)
      .post('/api/users/auth/register')
      .send({ email: 'bypass@test.com', password: STRONG_PASSWORD, fullName: 'Bypass' });

    expect(res.status).toBe(410);
    expect(res.body.errorCode).toBe('REGISTRATION_ENDPOINT_REMOVED');
    expect(await User.findOne({ email: 'bypass@test.com' })).toBeNull();
  });
});
