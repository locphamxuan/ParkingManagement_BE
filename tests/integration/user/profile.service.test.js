/** user/profile.service — cập nhật hồ sơ + đổi mật khẩu. */
const db = require('../../helpers/db');
const f = require('../../helpers/fixtures');
const profileService = require('../../../src/services/user/profile.service');
const User = require('../../../src/models/user/User');

beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => { await db.clear(); });

describe('update', () => {
  test('cập nhật fullName + phone', async () => {
    const u = await f.createUser();
    const res = await profileService.update(u._id, { fullName: 'New Name', phone: '0900000009' });
    expect(res.fullName).toBe('New Name');
    expect(res.phone).toBe('0900000009');
  });

  test('phone đã dùng bởi tài khoản khác → 409 PHONE_TAKEN', async () => {
    await f.createUser({ phone: '0900000001' });
    const u2 = await f.createUser();
    await expect(profileService.update(u2._id, { phone: '0900000001' }))
      .rejects.toMatchObject({ errorCode: 'PHONE_TAKEN' });
  });
});

describe('changePassword', () => {
  test('mật khẩu hiện tại sai → 400', async () => {
    const u = await f.createUser({ password: 'secret1' });
    await expect(profileService.changePassword(u._id, { currentPassword: 'wrong', newPassword: 'newpass1' }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  test('đổi mật khẩu thành công (hash mới khớp)', async () => {
    const u = await f.createUser({ password: 'secret1' });
    await profileService.changePassword(u._id, { currentPassword: 'secret1', newPassword: 'newpass1' });
    const fresh = await User.findById(u._id).select('+password');
    expect(await fresh.comparePassword('newpass1')).toBe(true);
  });
});
