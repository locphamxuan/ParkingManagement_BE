// Mongo's $dateToString/$dateTrunc default to UTC. Every "day" concept elsewhere
// in this codebase (dayBounds/localDayKey in buildingWallet.service.js, revenue
// dashboards) uses the process timezone — which config/env.js pins to the business
// timezone (APP_TIMEZONE, default Asia/Ho_Chi_Minh) so a UTC host still buckets
// days the way Vietnamese operations do. Without an explicit timezone, aggregation
// buckets would silently use UTC days and collide with local days near midnight.
const pad2 = (n) => String(n).padStart(2, '0');

/** Business-day UTC offset as "+HH:MM"/"-HH:MM", for $dateToString's `timezone` option. */
const localUtcOffset = () => {
  const offsetMin = -new Date().getTimezoneOffset(); // JS offset is inverted (UTC - local)
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  return `${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
};

/** Midnight that starts the business day containing `date`. */
const startOfBusinessDay = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

/** Last millisecond of the business day containing `date`. */
const endOfBusinessDay = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

/** Midnight that starts the business day `days` after the one containing `date`. */
const addDays = (date, days) => {
  const d = startOfBusinessDay(date);
  d.setDate(d.getDate() + days);
  return d;
};

module.exports = { localUtcOffset, startOfBusinessDay, endOfBusinessDay, addDays };
