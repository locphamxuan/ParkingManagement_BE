const ParkingSession = require('../models/operations/ParkingSession');

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** Số giờ giao nhau giữa hai khoảng [aStart,aEnd] và [bStart,bEnd] (ms → giờ). */
const overlapHours = (aStart, aEnd, bStart, bEnd) => {
  const s = Math.max(aStart, bStart);
  const e = Math.min(aEnd, bEnd);
  return e > s ? (e - s) / HOUR_MS : 0;
};

/** Mặc định giờ/ngày theo thời hạn gói: tuần 5h, tháng 7h, năm 10h. */
const defaultMaxHoursByDuration = (durationDays) => {
  const d = Number(durationDays) || 0;
  if (d <= 7) return 5;
  if (d <= 30) return 7;
  return 10;
};

/**
 * Tính tổng số giờ ĐỖ VƯỢT hạn mức/ngày (cộng dồn theo từng ngày dương lịch) cho
 * một phiên đỗ gói dài hạn sắp checkout. Cộng dồn cả các phiên gói đã hoàn thành
 * cùng biển số + tòa nhà trong cùng ngày để xác định phần đã dùng trước đó.
 *
 * @returns {Promise<number>} số giờ vượt (có thể là số lẻ), 0 nếu không vượt.
 */
const computeDailyOverageHours = async ({
  plateNumber,
  building,
  entryTime,
  exitTime,
  excludeSessionId,
  maxHoursPerDay,
  session = null,
}) => {
  const cap = Number(maxHoursPerDay) || 0;
  if (cap <= 0) return 0; // 0 = không giới hạn

  const entry = new Date(entryTime).getTime();
  const exit = new Date(exitTime).getTime();
  if (!entry || !exit || exit <= entry) return 0;

  // Hạn mức tính theo NGÀY dương lịch → phải gộp mọi phiên gói đã hoàn thành cùng
  // biển số + tòa nhà giao với CÁC NGÀY mà phiên hiện tại trải qua (kể cả phiên
  // sớm hơn, không trùng giờ phiên hiện tại). Lấy từ đầu ngày đầu tiên tới exit.
  const firstDayStart = new Date(entry);
  firstDayStart.setHours(0, 0, 0, 0);

  const priorSessions = await ParkingSession.find({
    _id: { $ne: excludeSessionId },
    plateNumber,
    building,
    paymentMethod: 'long_term',
    status: 'completed',
    entryTime: { $lt: new Date(exit) },
    exitTime: { $gt: firstDayStart },
  })
    .select('entryTime exitTime')
    .session(session);

  let totalOverage = 0;

  // Duyệt từng ngày dương lịch mà phiên hiện tại trải qua.
  let dayStart = new Date(entry);
  dayStart.setHours(0, 0, 0, 0);

  while (dayStart.getTime() < exit) {
    const dStart = dayStart.getTime();
    const dEnd = dStart + DAY_MS;

    const sessionHoursThisDay = overlapHours(entry, exit, dStart, dEnd);
    if (sessionHoursThisDay > 0) {
      let priorThisDay = 0;
      for (const p of priorSessions) {
        priorThisDay += overlapHours(
          new Date(p.entryTime).getTime(),
          new Date(p.exitTime).getTime(),
          dStart,
          dEnd,
        );
      }
      const freeRemaining = Math.max(0, cap - priorThisDay);
      totalOverage += Math.max(0, sessionHoursThisDay - freeRemaining);
    }

    dayStart = new Date(dEnd);
  }

  return totalOverage;
};

module.exports = { computeDailyOverageHours, defaultMaxHoursByDuration };
