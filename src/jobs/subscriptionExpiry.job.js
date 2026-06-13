const { LongTermSubscription, ParkingSlot, User, Notification } = require('../models');
const logger = require("../utils/logger");
const { sendNotificationEmail } = require('../utils/email');

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_GRACE_DAYS = 7;
const REMINDER_WINDOW_DAYS = 7; // cửa sổ nhắc TRƯỚC hạn (= mốc lớn nhất), độc lập với grace
const REMINDER_THRESHOLDS = [7, 5, 3, 1];
const RUN_INTERVAL_MS = 60 * 60 * 1000; // chạy mỗi giờ

const formatDate = (date) =>
  new Date(date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

// Số ngày grace lấy từ GÓI (LongTermPackage.graceDays), fallback 7.
const graceDaysOf = (sub) =>
  Math.max(Number(sub?.package?.graceDays ?? DEFAULT_GRACE_DAYS) || DEFAULT_GRACE_DAYS, 1);

const isSameCalendarDay = (a, b) =>
  a && b &&
  new Date(a).getFullYear() === new Date(b).getFullYear() &&
  new Date(a).getMonth() === new Date(b).getMonth() &&
  new Date(a).getDate() === new Date(b).getDate();

/**
 * Tạo thông báo in-app (chính) + gửi email (best-effort).
 * `subscription` cần được populate `building` (name) để hiển thị; nếu không có
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
    .populate('package', 'name graceDays');

  for (const sub of subs) {
    const daysLeft = Math.ceil((new Date(sub.endDate).getTime() - now) / DAY_MS);
    // Mốc lớn nhất phù hợp mà chưa từng gửi (vd daysLeft=4 → gửi mốc 5 nếu chưa gửi).
    const threshold = REMINDER_THRESHOLDS.find(
      (t) => daysLeft <= t && !sub.remindersSent.includes(t),
    );
    if (!threshold) continue;

    const pkgName = sub.package?.name || 'gói dài hạn';
    const message =
      `Gói "${pkgName}" cho biển số ${sub.plateNumber} sẽ hết hạn sau ${daysLeft} ngày ` +
      `(${formatDate(sub.endDate)}). Vui lòng gia hạn để tiếp tục giữ chỗ đỗ cố định.`;

    await notifySubscription(sub, {
      type: 'subscription_expiring',
      title: 'Gói dài hạn sắp hết hạn',
      message,
      emailHtml: `
        <p>Gói <strong>${pkgName}</strong> cho biển số <strong>${sub.plateNumber}</strong>
        sẽ hết hạn sau <strong>${daysLeft} ngày</strong> (${formatDate(sub.endDate)}).</p>
        <p>Hãy gia hạn sớm để giữ đúng chỗ đỗ cố định của bạn.</p>`,
    });

    await LongTermSubscription.updateOne(
      { _id: sub._id },
      { $addToSet: { remindersSent: threshold } },
    );
  }
};

/**
 * Bước 2 — Gói đã quá hạn: chuyển 'active' → 'expired'. GIỮ slot (grace 7 ngày).
 * User trở thành tài khoản thường (tính phí theo giờ) từ lần checkin kế tiếp.
 */
const expireActiveSubscriptions = async () => {
  const now = new Date();

  const subs = await LongTermSubscription.find({
    status: 'active',
    endDate: { $lt: now },
  })
    .populate('building', 'name')
    .populate('package', 'name graceDays');

  for (const sub of subs) {
    // Set lastGraceReminderAt = now để cảnh báo grace hàng ngày bắt đầu từ NGÀY SAU.
    await LongTermSubscription.updateOne(
      { _id: sub._id },
      { $set: { status: 'expired', lastGraceReminderAt: now } },
    );

    const graceDays = graceDaysOf(sub);
    const graceEnds = new Date(new Date(sub.endDate).getTime() + graceDays * DAY_MS);
    const pkgName = sub.package?.name || 'gói dài hạn';
    const message =
      `Gói "${pkgName}" cho biển số ${sub.plateNumber} đã hết hạn. Từ giờ xe sẽ được tính phí ` +
      `theo giờ như tài khoản thường. Chỗ đỗ cố định được giữ tới ${formatDate(graceEnds)} ` +
      `nếu bạn gia hạn trong thời gian này.`;

    await notifySubscription(sub, {
      type: 'subscription_expired',
      title: 'Gói dài hạn đã hết hạn',
      message,
      emailHtml: `
        <p>Gói <strong>${pkgName}</strong> cho biển số <strong>${sub.plateNumber}</strong> đã hết hạn.</p>
        <p>Từ giờ xe của bạn sẽ được tính phí theo giờ như tài khoản thường.</p>
        <p>Chỗ đỗ cố định vẫn được giữ tới <strong>${formatDate(graceEnds)}</strong> —
        hãy gia hạn trước thời điểm này để giữ đúng chỗ đỗ.</p>`,
    });
  }
};

/**
 * Bước 3 — Cảnh báo MỖI NGÀY trong thời gian grace cho gói đã hết hạn còn giữ slot.
 * Gửi tối đa 1 lần/ngày dương lịch (theo lastGraceReminderAt).
 */
const sendGraceReminders = async () => {
  const now = new Date();

  const subs = await LongTermSubscription.find({
    status: 'expired',
    slot: { $ne: null },
    slotReleased: false,
  })
    .populate('building', 'name')
    .populate('package', 'name graceDays');

  for (const sub of subs) {
    // Đã nhắc trong ngày hôm nay rồi → bỏ qua.
    if (isSameCalendarDay(sub.lastGraceReminderAt, now)) continue;

    const graceDays = graceDaysOf(sub);
    const graceEnds = new Date(new Date(sub.endDate).getTime() + graceDays * DAY_MS);
    if (now.getTime() > graceEnds.getTime()) continue; // hết grace → để releaseGraceSlots xử lý

    const pkgName = sub.package?.name || 'gói dài hạn';
    const message =
      `Gói "${pkgName}" (biển số ${sub.plateNumber}) đã hết hạn. Chỗ đỗ cố định sẽ bị thu hồi ` +
      `vào ${formatDate(graceEnds)} nếu bạn không gia hạn. Hiện xe đang được tính phí theo giờ.`;

    await notifySubscription(sub, {
      type: 'subscription_expiring',
      title: 'Gói đã hết hạn — sắp thu hồi chỗ đỗ',
      message,
      emailHtml: `
        <p>Gói <strong>${pkgName}</strong> (biển số <strong>${sub.plateNumber}</strong>) đã hết hạn.</p>
        <p>Chỗ đỗ cố định sẽ bị <strong>thu hồi vào ${formatDate(graceEnds)}</strong> nếu bạn không gia hạn.
        Trong thời gian này xe của bạn được tính phí theo giờ như tài khoản thường.</p>`,
    });

    await LongTermSubscription.updateOne({ _id: sub._id }, { $set: { lastGraceReminderAt: now } });
  }
};

/**
 * Bước 4 — Hết grace (theo cấu hình từng tòa nhà) mà chưa gia hạn: thả slot về
 * 'available' và báo user.
 */
const releaseGraceSlots = async () => {
  const now = Date.now();

  const subs = await LongTermSubscription.find({
    status: 'expired',
    slot: { $ne: null },
    slotReleased: false,
  })
    .populate('building', 'name')
    .populate('package', 'name graceDays');

  for (const sub of subs) {
    const graceDays = graceDaysOf(sub);
    const graceEnds = new Date(sub.endDate).getTime() + graceDays * DAY_MS;
    if (now <= graceEnds) continue; // còn trong grace

    try {
      await ParkingSlot.findByIdAndUpdate(sub.slot, { status: 'available' });
    } catch (err) {
      logger.error('[subscriptionExpiry] release slot failed:', err.message);
      continue; // không đánh dấu slotReleased nếu chưa thả được
    }

    await LongTermSubscription.updateOne({ _id: sub._id }, { $set: { slotReleased: true } });

    const pkgName = sub.package?.name || 'gói dài hạn';
    const message =
      `Chỗ đỗ cố định của gói "${pkgName}" (biển số ${sub.plateNumber}) đã được thu hồi do ` +
      `quá ${graceDays} ngày chưa gia hạn. Bạn vẫn có thể đỗ xe theo lượt và mua gói mới bất cứ lúc nào.`;

    await notifySubscription(sub, {
      type: 'subscription_slot_released',
      title: 'Chỗ đỗ cố định đã được thu hồi',
      message,
      emailHtml: `
        <p>Chỗ đỗ cố định của gói <strong>${pkgName}</strong> (biển số <strong>${sub.plateNumber}</strong>)
        đã được thu hồi do quá ${graceDays} ngày chưa gia hạn.</p>
        <p>Bạn vẫn có thể đỗ xe theo lượt (tính phí theo giờ) và mua gói mới bất cứ lúc nào.</p>`,
    });
  }
};

const runOnce = async () => {
  // Mỗi bước try/catch riêng để một bước lỗi không chặn các bước còn lại.
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
  try {
    await sendGraceReminders();
  } catch (err) {
    logger.error('[subscriptionExpiry] sendGraceReminders error:', err.message);
  }
  try {
    await releaseGraceSlots();
  } catch (err) {
    logger.error('[subscriptionExpiry] releaseGraceSlots error:', err.message);
  }
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
  sendGraceReminders,
  releaseGraceSlots,
};
