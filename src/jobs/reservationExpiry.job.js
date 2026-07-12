const { Reservation, User, Notification } = require('../models');
const logger = require("../utils/logger");
const { sendNotificationEmail } = require('../utils/email');
const { getMaxHoldMs } = require('../utils/reservationHold');
const { expireReservationWithRefund } = require('../services/reservationLifecycle.service');
const { acquireLock, releaseLock } = require('../utils/jobLock');

const CHECKINABLE_STATUSES = ['pending', 'confirmed'];
const RUN_INTERVAL_MS = 5 * 60 * 1000; // chạy mỗi 5 phút (reservation nhạy thời gian hơn gói)

const formatDateTime = (date) =>
  new Date(date).toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

/**
 * Tạo Notification in-app (chính) + email (best-effort) cho chủ reservation.
 */
const notifyUser = async (reservation, { type, title, message, emailHtml }) => {
  try {
    await Notification.create({
      user: reservation.user,
      type,
      title,
      message,
      plateNumber: reservation.plateNumber || null,
      building: reservation.building?._id || reservation.building || null,
    });
  } catch (err) {
    logger.error('[reservationExpiry] Notification.create failed:', err.message);
  }

  try {
    const user = await User.findById(reservation.user).select('email fullName');
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
    logger.error('[reservationExpiry] sendNotificationEmail failed:', err.message);
  }
};

/**
 * Quét các lượt đặt chỗ chưa check-in (pending/confirmed) đã quá thời gian giữ
 * chỗ (maxHoldMinutes do manager cấu hình theo từng tòa nhà) so với giờ bắt đầu
 * → đánh dấu 'expired', thả slot về 'available' và báo cho user. Tiền cọc bị mất
 * (không hoàn — phạt no-show), giống nhánh expire khi check-in.
 */
const expireStaleReservations = async () => {
  const now = Date.now();

  // Lấy mọi lượt đã tới giờ bắt đầu nhưng chưa check-in; lọc theo hold riêng từng tòa.
  const reservations = await Reservation.find({
    status: { $in: CHECKINABLE_STATUSES },
    startTime: { $lt: new Date(now) },
  }).populate('building', 'name');

  // Cache hold theo buildingId để tránh truy vấn policy lặp lại.
  const holdCache = new Map();
  const holdMsForBuilding = async (buildingId) => {
    const key = String(buildingId);
    if (!holdCache.has(key)) holdCache.set(key, await getMaxHoldMs(buildingId));
    return holdCache.get(key);
  };

  for (const reservation of reservations) {
    const buildingId = reservation.building?._id || reservation.building;
    const holdMs = await holdMsForBuilding(buildingId);
    const expiresAt = new Date(reservation.startTime).getTime() + holdMs;
    if (expiresAt >= now) continue; // còn trong thời gian giữ chỗ

    let refundAmount = 0;
    let refundPercent = 0;

    try {
      const outcome = await expireReservationWithRefund(reservation._id);
      if (!outcome) continue; // đã được đường code khác xử lý (idempotent)
      refundAmount = outcome.refundAmount;
      refundPercent = outcome.refundPercent;
    } catch (err) {
      logger.error('[reservationExpiry] expire reservation failed:', err.message);
      continue;
    }

    const holdMin = Math.round(holdMs / 60000);
    const refundNote = refundAmount > 0
      ? `A partial refund of ${refundPercent}% (${refundAmount.toLocaleString('vi-VN')} VND) has been credited to your wallet.`
      : 'The deposit is non-refundable per the building policy.';

    const message =
      `Reservation ${reservation.code} for vehicle ${reservation.plateNumber} has expired because ` +
      `it was not checked in within ${holdMin} minutes of the start time (${formatDateTime(reservation.startTime)}). ` +
      `The slot has been released. ${refundNote}`;

    await notifyUser(reservation, {
      type: 'reservation_expired',
      title: 'Reservation Expired',
      message,
      emailHtml: `
        <p>Reservation <strong>${reservation.code}</strong> for vehicle
        <strong>${reservation.plateNumber}</strong> has expired because it was not checked in within ${holdMin} minutes of the start time
        (${formatDateTime(reservation.startTime)}).</p>
        <p>The reserved slot has been released.</p>
        ${refundAmount > 0
          ? `<p>A partial refund of <strong>${refundPercent}%</strong> (${refundAmount.toLocaleString('vi-VN')} VND) has been credited to your wallet.</p>`
          : '<p>The <strong>deposit is non-refundable</strong> per the building policy.</p>'
        }
        <p>You can make a new reservation at any time.</p>`,
    });
  }
};

/**
 * Cảnh báo MỘT LẦN cho reservation đã CHECK-IN nhưng đã quá endTime (đang đỗ quá
 * giờ đặt). Phí phần vượt + phụ phí phạt sẽ thu khi xe ra; ở đây chỉ báo cho user.
 */
const notifyOverstayingReservations = async () => {
  const now = new Date();

  const reservations = await Reservation.find({
    status: 'checked_in',
    endTime: { $ne: null, $lt: now },
    overstayNotifiedAt: null,
  }).populate('building', 'name');

  for (const reservation of reservations) {
    const message =
      `Vehicle ${reservation.plateNumber} (reservation ${reservation.code}) is overstaying ` +
      `(expired at ${formatDateTime(reservation.endTime)}). Overstayed time will be charged at standard ` +
      `hourly rates upon exit. Please check out soon to avoid additional fees.`;

    await notifyUser(reservation, {
      type: 'reservation_overstay',
      title: 'Overstaying Reservation',
      message,
      emailHtml: `
        <p>Vehicle <strong>${reservation.plateNumber}</strong> (reservation <strong>${reservation.code}</strong>)
        is <strong>overstaying</strong> (expired at ${formatDateTime(reservation.endTime)}).</p>
        <p>Overstayed time will be charged at <strong>standard hourly rates</strong> upon exit.
        Please exit soon to avoid additional fees.</p>`,
    });

    await Reservation.updateOne({ _id: reservation._id }, { $set: { overstayNotifiedAt: now } });
  }
};

const runOnce = async () => {
  const acquired = await acquireLock('reservationExpiry', 8 * 60 * 1000);
  if (!acquired) {
    logger.info('[reservationExpiry] skipped — another instance is running');
    return;
  }
  try {
    await expireStaleReservations();
  } catch (err) {
    logger.error('[reservationExpiry] expireStaleReservations error:', err.message);
  }
  try {
    await notifyOverstayingReservations();
  } catch (err) {
    logger.error('[reservationExpiry] notifyOverstayingReservations error:', err.message);
  }
  await releaseLock('reservationExpiry');
};

let timer = null;

const start = () => {
  if (timer) return; // tránh start nhiều lần
  runOnce().catch((err) => logger.error('[reservationExpiry] initial run error:', err.message));
  timer = setInterval(() => {
    runOnce().catch((err) => logger.error('[reservationExpiry] run error:', err.message));
  }, RUN_INTERVAL_MS);
  if (timer.unref) timer.unref();
  logger.info('[reservationExpiry] scheduler started (interval 5m)');
};

module.exports = { start, runOnce, expireStaleReservations, notifyOverstayingReservations };
