/** auth.service — đăng ký, đăng nhập, khóa brute-force, quên/đặt lại mật khẩu. */
jest.mock('../../src/utils/email', () => ({
  sendResetPasswordEmail: jest.fn().mockResolvedValue(undefined),
  sendOtpEmail: jest.fn().mockResolvedValue(undefined),
  sendNotificationEmail: jest.fn().mockResolvedValue(undefined),
}));

const crypto = require('crypto');
const db = require('../helpers/db');
const authService = require('../../src/services/auth.service');
const email = require('../../src/utils/email');
const User = require('../../src/models/user/User');

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
    await authService.forgotPassword('a@test.com', 'http://fe');
    expect(email.sendResetPasswordEmail).toHaveBeenCalledTimes(1);
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
