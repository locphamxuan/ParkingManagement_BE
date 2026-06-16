const User = require('../../models/user/User');
const AppError = require('../../utils/AppError');

const update = async (userId, payload) => {
  const updates = {};
  if (payload.fullName !== undefined) updates.fullName = String(payload.fullName).trim();
  if (payload.phone !== undefined) updates.phone = payload.phone;
  if (payload.avatar !== undefined) updates.avatar = payload.avatar;

  // Phone phải là duy nhất (trừ chính người dùng này).
  if (updates.phone) {
    const taken = await User.exists({ phone: String(updates.phone).trim(), _id: { $ne: userId } });
    if (taken) throw new AppError('Số điện thoại đã được sử dụng bởi tài khoản khác', 409, 'PHONE_TAKEN');
  }

  const user = await User.findByIdAndUpdate(userId, updates, { new: true, runValidators: true });
  if (!user) throw new AppError('User not found', 404);
  return user;
};

const changePassword = async (userId, { currentPassword, newPassword }) => {
  const user = await User.findById(userId).select('+password');
  if (!user) throw new AppError('User not found', 404);

  const match = await user.comparePassword(currentPassword);
  if (!match) throw new AppError('Mật khẩu hiện tại không đúng', 400);

  user.password = newPassword;
  // Chỉ validate field vừa đổi (password) — tránh việc dữ liệu cũ không hợp lệ
  // (vd phone rỗng, biển số định dạng cũ) làm save() báo lỗi oan khi đổi mật khẩu.
  await user.save({ validateModifiedOnly: true });
};

module.exports = { update, changePassword };
