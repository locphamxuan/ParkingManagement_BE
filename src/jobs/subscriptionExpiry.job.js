const { LongTermSubscription, User, Notification } = require('../models');
const logger = require("../utils/logger");
const { sendNotificationEmail } = require('../utils/email');
const { acquireLock, releaseLock } = require('../utils/jobLock');

const DAY_MS = 24 * 60 * 60 * 1000;
const REMINDER_WINDOW_DAYS = 7; // cửa sổ nhắc TRƯỚC hạn (= mốc lớn nhất)
const REMINDER_THRESHOLDS = [7, 5, 3, 1];
const RUN_INTERVAL_MS = 60 * 60 * 1000; // chạy mỗi giờ

const formatDate = (date) =>
  new Date(date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

/**
 * Tạo thông báo in-app (chính) + gửi email (best-effort).
 * `subscription` nên được populate `building` (name) để hiển thị; nếu không có
 * vẫn chạy bình thường.
 */
const notifySubscription = async (subscription, { type, title, message, emailHtml }) => {
  try {
    await Notification.create({
      user: subscription.user,
      type,
      title,
      message,
      plateNumber: subscription.plateNumber || null,
      building: subscription.building?._id || subscription.building || null,
    });
  } catch (err) {
    logger.error('[subscriptionExpiry] Notification.create failed:', err.message);
  }

  // Email best-effort — lỗi gửi mail không được làm hỏng job.
  try {
    const user = await User.findById(subscription.user).select('email fullName');
    if (user?.email) {
      await sendNotificationEmail({
        to: user.email,
        fullName: user.fullName,
        subject: title,
        heading: title,
        bodyHtml: emailHtml || `<p>${message}</p>`,
      });
    }
  } catch (err) {
    logger.error('[subscriptionExpiry] sendSubscriptionEmail failed:', err.message);
  }
};

/**
 * Bước 1 — Nhắc trước hạn 7/5/3/1 ngày. Mỗi mốc chỉ gửi một lần (theo
 * `remindersSent`).
 */
const sendExpiryReminders = async () => {
  const now = Date.now();
  const windowEnd = new Date(now + REMINDER_WINDOW_DAYS * DAY_MS);

  const subs = await LongTermSubscription.find({
    status: 'active',
    endDate: { $gt: new Date(now), $lte: windowEnd },
  })
    .populate('building', 'name')
    .populate('package', 'name');

  for (const sub of subs) {
    const daysLeft = Math.ceil((new Date(sub.endDate).getTime() - now) / DAY_MS);
    // Mốc lớn nhất phù hợp mà chưa từng gửi (vd daysLeft=4 → gửi mốc 5 nếu chưa gửi).
    const threshold = REMINDER_THRESHOLDS.find(
      (t) => daysLeft <= t && !sub.remindersSent.includes(t),
    );
    if (!threshold) continue;

    const pkgName = sub.package?.name || 'long-term package';
    const message =
      `Your subscription "${pkgName}" for vehicle ${sub.plateNumber} will expire in ${daysLeft} days ` +
      `(${formatDate(sub.endDate)}). Please renew to continue receiving parking benefits.`;

    await notifySubscription(sub, {
      type: 'subscription_expiring',
      title: 'Subscription Expiring Soon',
      message,
      emailHtml: `
        <p>Your subscription <strong>${pkgName}</strong> for vehicle <strong>${sub.plateNumber}</strong>
        will expire in <strong>${daysLeft} days</strong> (${formatDate(sub.endDate)}).</p>
        <p>Please renew soon to continue receiving package parking privileges.</p>`,
    });

    await LongTermSubscription.updateOne(
      { _id: sub._id },
      { $addToSet: { remindersSent: threshold } },
    );
  }
};

/**
 * Bước 2 — Gói đã quá hạn: chuyển 'active' → 'expired'.
 * Gói floating không giữ slot, nên hết hạn = user trở thành khách thường (tính
 * phí theo giờ) từ lần check-in kế tiếp. Không còn grace/giữ slot.
 */
const expireActiveSubscriptions = async () => {
  const now = new Date();

  const subs = await LongTermSubscription.find({
    status: 'active',
    endDate: { $lt: now },
  })
    .populate('building', 'name')
    .populate('package', 'name');

  for (const sub of subs) {
    await LongTermSubscription.updateOne(
      { _id: sub._id },
      { $set: { status: 'expired' } },
    );

    const pkgName = sub.package?.name || 'long-term package';
    const message =
      `Your subscription "${pkgName}" for vehicle ${sub.plateNumber} has expired. Future check-ins ` +
      `will be charged at standard hourly rates. Please renew or purchase a new package.`;

    await notifySubscription(sub, {
      type: 'subscription_expired',
      title: 'Subscription Expired',
      message,
      emailHtml: `
        <p>Your subscription <strong>${pkgName}</strong> for vehicle <strong>${sub.plateNumber}</strong> has expired.</p>
        <p>Your vehicle will now be charged at standard hourly rates.
        Please renew or subscribe to a new package to keep your parking privileges.</p>`,
    });
  }
};

const runOnce = async () => {
  const acquired = await acquireLock('subscriptionExpiry', 55 * 60 * 1000);
  if (!acquired) {
    logger.info('[subscriptionExpiry] skipped — another instance is running');
    return;
  }
  // Mỗi bước try/catch riêng để một bước lỗi không chặn bước còn lại.
  try {
    await sendExpiryReminders();
  } catch (err) {
    logger.error('[subscriptionExpiry] sendExpiryReminders error:', err.message);
  }
  try {
    await expireActiveSubscriptions();
  } catch (err) {
    logger.error('[subscriptionExpiry] expireActiveSubscriptions error:', err.message);
  }
  await releaseLock('subscriptionExpiry');
};

let timer = null;

const start = () => {
  if (timer) return; // tránh start nhiều lần
  // Chạy ngay khi khởi động rồi lặp mỗi giờ.
  runOnce().catch((err) => logger.error('[subscriptionExpiry] initial run error:', err.message));
  timer = setInterval(() => {
    runOnce().catch((err) => logger.error('[subscriptionExpiry] run error:', err.message));
  }, RUN_INTERVAL_MS);
  // Không giữ event loop sống chỉ vì timer này.
  if (timer.unref) timer.unref();
  logger.info('[subscriptionExpiry] scheduler started (interval 1h)');
};

module.exports = {
  start,
  runOnce,
  sendExpiryReminders,
  expireActiveSubscriptions,
};
