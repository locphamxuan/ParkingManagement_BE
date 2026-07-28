const User = require('../../models/user/User');
const AppError = require('../../utils/AppError');
const { assertStrongPassword } = require('../../utils/passwordPolicy');

const update = async (userId, payload) => {
  const setUpdates = {};
  const unsetUpdates = {};
  if (payload.fullName !== undefined) setUpdates.fullName = String(payload.fullName).trim();
  if (payload.phone !== undefined) {
    const trimmedPhone = String(payload.phone).trim();
    if (trimmedPhone) {
      setUpdates.phone = trimmedPhone;
    } else {
      // Xóa hẳn field (không set "") — khớp sparse unique index, tránh 2 user
      // cùng xóa SĐT bị đụng E11000 vì cùng giá trị "".
      unsetUpdates.phone = '';
    }
  }
  if (payload.avatar !== undefined) setUpdates.avatar = payload.avatar;

  // Phone phải là duy nhất (trừ chính người dùng này).
  if (setUpdates.phone) {
    const taken = await User.exists({ phone: setUpdates.phone, _id: { $ne: userId } });
    if (taken) throw new AppError('Số điện thoại đã được sử dụng bởi tài khoản khác', 409, 'PHONE_TAKEN');
  }

  const mongoUpdate = {};
  if (Object.keys(setUpdates).length) mongoUpdate.$set = setUpdates;
  if (Object.keys(unsetUpdates).length) mongoUpdate.$unset = unsetUpdates;

  const user = await User.findByIdAndUpdate(userId, mongoUpdate, { new: true, runValidators: true });
  if (!user) throw new AppError('User not found', 404);
  return user;
};

const changePassword = async (userId, { currentPassword, newPassword }) => {
  const user = await User.findById(userId).select('+password');
  if (!user) throw new AppError('User not found', 404);

  const match = await user.comparePassword(currentPassword);
  if (!match) throw new AppError('Mật khẩu hiện tại không đúng', 400);

  assertStrongPassword(newPassword);

  user.password = newPassword;
  // Changing the password evicts every other session immediately.
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  // Chỉ validate field vừa đổi (password) — tránh việc dữ liệu cũ không hợp lệ
  // (vd phone rỗng, biển số định dạng cũ) làm save() báo lỗi oan khi đổi mật khẩu.
  await user.save({ validateModifiedOnly: true });
};

module.exports = { update, changePassword };
