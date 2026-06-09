const { Notification } = require('../../models');
const AppError = require('../../utils/AppError');

const list = async (userId) => {
  const items = await Notification.find({ user: userId }).sort({ createdAt: -1 }).limit(50);
  const unread = await Notification.countDocuments({ user: userId, isRead: false });
  return { items, unread };
};

const markRead = async (userId, notificationId) => {
  const notif = await Notification.findOneAndUpdate(
    { _id: notificationId, user: userId },
    { $set: { isRead: true } },
    { new: true }
  );
  if (!notif) throw new AppError('Notification not found', 404);
  return notif;
};

const markAllRead = async (userId) => {
  await Notification.updateMany({ user: userId, isRead: false }, { $set: { isRead: true } });
  return { ok: true };
};

module.exports = { list, markRead, markAllRead };
