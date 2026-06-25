const { Reservation, ParkingSlot, User, Notification } = require('../models');
const logger = require("../utils/logger");
const { sendNotificationEmail } = require('../utils/email');
const { getMaxHoldMs } = require('../utils/reservationHold');

const CHECKINABLE_STATUSES = ['pending', 'confirmed'];
const RUN_INTERVAL_MS = 5 * 60 * 1000; // chạy mỗi 5 phút (reservation nhạy thời gian hơn gói)

const formatDateTime = (date) =>
  new Date(date).toLocaleString('en-US', {
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

    try {
      reservation.status = 'expired';
      await reservation.save();

      // Thả slot nếu có giữ (không đụng vào slot đang bảo trì).
      const slotId = reservation.slot?._id || reservation.slot || null;
      if (slotId) {
        const slot = await ParkingSlot.findById(slotId);
        if (slot && slot.status !== 'maintenance') {
          slot.status = 'available';
          await slot.save();
        }
      }
    } catch (err) {
      logger.error('[reservationExpiry] expire reservation failed:', err.message);
      continue;
    }

    const holdMin = Math.round(holdMs / 60000);
    const message =
      `Reservation ${reservation.code} for vehicle ${reservation.plateNumber} has expired because ` +
      `it was not checked in within ${holdMin} minutes of the start time (${formatDateTime(reservation.startTime)}). ` +
      `The slot has been released and the deposit is non-refundable.`;

    await notifyUser(reservation, {
      type: 'reservation_expired',
      title: 'Reservation Expired',
      message,
      emailHtml: `
        <p>Reservation <strong>${reservation.code}</strong> for vehicle
        <strong>${reservation.plateNumber}</strong> has expired because it was not checked in within ${holdMin} minutes of the start time
        (${formatDateTime(reservation.startTime)}).</p>
        <p>The reserved slot has been released and the <strong>deposit is non-refundable</strong>.</p>
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
      `hourly rates plus penalty surcharges upon exit. Please check out soon to avoid additional fees.`;

    await notifyUser(reservation, {
      type: 'reservation_overstay',
      title: 'Overstaying Reservation',
      message,
      emailHtml: `
        <p>Vehicle <strong>${reservation.plateNumber}</strong> (reservation <strong>${reservation.code}</strong>)
        is <strong>overstaying</strong> (expired at ${formatDateTime(reservation.endTime)}).</p>
        <p>Overstayed time will be charged at standard hourly rates <strong>plus penalty surcharges</strong> upon exit.
        Please exit soon to avoid additional fees.</p>`,
    });

    await Reservation.updateOne({ _id: reservation._id }, { $set: { overstayNotifiedAt: now } });
  }
};

const runOnce = async () => {
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
