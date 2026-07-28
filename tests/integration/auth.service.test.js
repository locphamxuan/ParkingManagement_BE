/** auth.service — đăng ký, đăng nhập, khóa brute-force, quên/đặt lại mật khẩu. */
jest.mock('../../src/utils/email', () => ({
  sendResetPasswordEmail: jest.fn().mockResolvedValue(undefined),
  sendOtpEmail: jest.fn().mockResolvedValue(undefined),
  sendNotificationEmail: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/utils/sms', () => ({
  sendOtpSms: jest.fn().mockResolvedValue(undefined),
}));

const crypto = require('crypto');
const db = require('../helpers/db');
const authService = require('../../src/services/auth.service');
const email = require('../../src/utils/email');
const sms = require('../../src/utils/sms');
const User = require('../../src/models/user/User');
const PhoneOtp = require('../../src/models/user/PhoneOtp');

beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => { await db.clear(); jest.clearAllMocks(); });

const reg = (over = {}) =>
  authService.register({ email: 'a@test.com', password: 'secret1', fullName: 'A', ...over });

describe('register', () => {
  test('tạo user role=user, trả token + user công khai (ẩn password)', async () => {
    const res = await reg();
    expect(res.token).toBeTruthy();
    expect(res.user.email).toBe('a@test.com');
    expect(res.user.role).toBe('user');
    expect(res.user.password).toBeUndefined();
  });

  test('email trùng → 409', async () => {
    await reg();
    await expect(reg()).rejects.toMatchObject({ statusCode: 409 });
  });

  test('số điện thoại trùng → 409 PHONE_TAKEN', async () => {
    await reg({ phone: '0900000001' });
    await expect(reg({ email: 'b@test.com', phone: '0900000001' }))
      .rejects.toMatchObject({ errorCode: 'PHONE_TAKEN' });
  });
});

describe('login', () => {
  test('đúng mật khẩu → trả token, cập nhật lastLoginAt', async () => {
    await reg();
    const res = await authService.login({ email: 'a@test.com', password: 'secret1' });
    expect(res.token).toBeTruthy();
    const u = await User.findOne({ email: 'a@test.com' });
    expect(u.lastLoginAt).toBeTruthy();
  });

  test('sai mật khẩu → 401', async () => {
    await reg();
    await expect(authService.login({ email: 'a@test.com', password: 'wrong' }))
      .rejects.toMatchObject({ statusCode: 401 });
  });

  test('email không tồn tại → 401 (thông báo chung)', async () => {
    await expect(authService.login({ email: 'none@test.com', password: 'x' }))
      .rejects.toMatchObject({ statusCode: 401 });
  });

  test('sai 5 lần liên tiếp → khóa tài khoản (423 ACCOUNT_LOCKED)', async () => {
    await reg();
    for (let i = 0; i < 5; i += 1) {
      await expect(authService.login({ email: 'a@test.com', password: 'bad' })).rejects.toBeDefined();
    }
    await expect(authService.login({ email: 'a@test.com', password: 'secret1' }))
      .rejects.toMatchObject({ statusCode: 423, errorCode: 'ACCOUNT_LOCKED' });
  });

  test('tài khoản bị vô hiệu hóa → 403', async () => {
    await reg();
    await User.updateOne({ email: 'a@test.com' }, { isActive: false });
    await expect(authService.login({ email: 'a@test.com', password: 'secret1' }))
      .rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('forgotPassword + resetPassword', () => {
  test('forgotPassword đặt token + gửi email; email lạ → không throw, không gửi', async () => {
    await reg();
    await authService.forgotPassword('a@test.com');
    expect(email.sendResetPasswordEmail).toHaveBeenCalledTimes(1);
    expect(email.sendResetPasswordEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        resetUrl: expect.stringMatching(/^http:\/\/localhost:5173\/auth\/reset-password\?token=/),
      }),
    );
    const u = await User.findOne({ email: 'a@test.com' }).select('+resetPasswordToken');
    expect(u.resetPasswordToken).toBeTruthy();

    await authService.forgotPassword('none@test.com');
    expect(email.sendResetPasswordEmail).toHaveBeenCalledTimes(1); // vẫn 1
  });

  test('resetPassword với token hợp lệ → đổi mật khẩu, login mới hoạt động', async () => {
    await reg();
    const plain = crypto.randomBytes(16).toString('hex');
    const hashed = crypto.createHash('sha256').update(plain).digest('hex');
    await User.updateOne(
      { email: 'a@test.com' },
      { resetPasswordToken: hashed, resetPasswordExpires: new Date(Date.now() + 60000) },
    );
    await authService.resetPassword(plain, 'newpass1');
    const res = await authService.login({ email: 'a@test.com', password: 'newpass1' });
    expect(res.token).toBeTruthy();
  });

  test('resetPassword token sai → 400', async () => {
    await expect(authService.resetPassword('badtoken', 'newpass1'))
      .rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('requestPasswordResetSms + resetPasswordSms', () => {
  const regWithPhone = (phone = '0911111111') => reg({ email: `${phone}@test.com`, phone });

  const getOtpFor = async (phone) => {
    // OTP chỉ lưu dạng hash trong DB (không lộ plaintext) → đọc lại từ mock sendOtpSms.
    expect(sms.sendOtpSms).toHaveBeenCalled();
    const call = sms.sendOtpSms.mock.calls.find(([arg]) => arg.phone === phone);
    return call[0].otp;
  };

  test('SĐT khớp user active → tạo PhoneOtp + gửi SMS', async () => {
    await regWithPhone();
    await authService.requestPasswordResetSms('0911111111');
    expect(sms.sendOtpSms).toHaveBeenCalledTimes(1);
    const record = await PhoneOtp.findOne({ phone: '0911111111', purpose: 'password_reset' });
    expect(record).toBeTruthy();
    expect(record.consumedAt).toBeNull();
  });

  test('SĐT không tồn tại → không tạo record, không gửi SMS, vẫn resolve', async () => {
    await expect(authService.requestPasswordResetSms('0999999999')).resolves.toBeUndefined();
    expect(sms.sendOtpSms).not.toHaveBeenCalled();
    const record = await PhoneOtp.findOne({ phone: '0999999999' });
    expect(record).toBeNull();
  });

  test('gọi lại trong vòng 60s → không gửi SMS lần 2', async () => {
    await regWithPhone();
    await authService.requestPasswordResetSms('0911111111');
    await authService.requestPasswordResetSms('0911111111');
    expect(sms.sendOtpSms).toHaveBeenCalledTimes(1);
  });

  test('OTP đúng → đổi mật khẩu, trả token, OTP bị đánh dấu đã dùng', async () => {
    await regWithPhone();
    await authService.requestPasswordResetSms('0911111111');
    const otp = await getOtpFor('0911111111');

    const res = await authService.resetPasswordSms({ phone: '0911111111', otp, newPassword: 'newpass1' });
    expect(res.token).toBeTruthy();

    const login = await authService.login({ email: '0911111111@test.com', password: 'newpass1' });
    expect(login.token).toBeTruthy();

    const record = await PhoneOtp.findOne({ phone: '0911111111' });
    expect(record.consumedAt).toBeTruthy();
  });

  test('OTP sai hoặc hết hạn → 400, không đổi mật khẩu', async () => {
    await regWithPhone();
    await authService.requestPasswordResetSms('0911111111');

    await expect(
      authService.resetPasswordSms({ phone: '0911111111', otp: '000000', newPassword: 'newpass1' }),
    ).rejects.toMatchObject({ statusCode: 400 });

    await expect(authService.login({ email: '0911111111@test.com', password: 'secret1' })).resolves.toBeTruthy();
  });

  test('sai OTP 5 lần → khoá record, kể cả nhập đúng sau đó cũng bị từ chối', async () => {
    await regWithPhone();
    await authService.requestPasswordResetSms('0911111111');
    const otp = await getOtpFor('0911111111');

    for (let i = 0; i < 5; i += 1) {
      await expect(
        authService.resetPasswordSms({ phone: '0911111111', otp: '000000', newPassword: 'newpass1' }),
      ).rejects.toMatchObject({ statusCode: 400 });
    }

    await expect(
      authService.resetPasswordSms({ phone: '0911111111', otp, newPassword: 'newpass1' }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('newPassword quá ngắn → 400, không tiêu OTP', async () => {
    await regWithPhone();
    await authService.requestPasswordResetSms('0911111111');
    const otp = await getOtpFor('0911111111');

    await expect(
      authService.resetPasswordSms({ phone: '0911111111', otp, newPassword: '123' }),
    ).rejects.toMatchObject({ statusCode: 400 });

    const record = await PhoneOtp.findOne({ phone: '0911111111' });
    expect(record.consumedAt).toBeNull();
  });
});
