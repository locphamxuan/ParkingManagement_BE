const AppError = require('./AppError');

const BUSINESS_TIMEZONE = process.env.BUSINESS_TIMEZONE || 'Asia/Ho_Chi_Minh';
const HH_MM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const parseTime = (value) => {
  const match = HH_MM_RE.exec(`${value || ''}`);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
};

const zonedParts = (date, timeZone = BUSINESS_TIMEZONE) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
};

const dateKey = ({ year, month, day }) => `${year}-${month}-${day}`;

const nextDateKey = (key) => {
  const [year, month, day] = key.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return [
    next.getUTCFullYear(),
    String(next.getUTCMonth() + 1).padStart(2, '0'),
    String(next.getUTCDate()).padStart(2, '0'),
  ].join('-');
};

const isWithinOperatingWindow = (open, close, now = new Date(), timeZone = BUSINESS_TIMEZONE) => {
  const openMinutes = parseTime(open);
  const closeMinutes = parseTime(close);
  if (openMinutes === null || closeMinutes === null || openMinutes === closeMinutes) {
    throw new AppError('Invalid operating hours', 400, 'INVALID_OPERATING_HOURS');
  }

  const parts = zonedParts(now, timeZone);
  const currentMinutes = Number(parts.hour) * 60 + Number(parts.minute);
  return openMinutes < closeMinutes
    ? currentMinutes >= openMinutes && currentMinutes < closeMinutes
    : currentMinutes >= openMinutes || currentMinutes < closeMinutes;
};

const isWithinShiftWindow = (
  { workDate, startTime, endTime },
  now = new Date(),
  timeZone = BUSINESS_TIMEZONE,
) => {
  const startMinutes = parseTime(startTime);
  const endMinutes = parseTime(endTime);
  if (startMinutes === null || endMinutes === null || startMinutes === endMinutes) return false;

  const nowParts = zonedParts(now, timeZone);
  const workParts = zonedParts(new Date(workDate), timeZone);
  const nowKey = dateKey(nowParts);
  const workKey = dateKey(workParts);
  const currentMinutes = Number(nowParts.hour) * 60 + Number(nowParts.minute);

  if (startMinutes < endMinutes) {
    return nowKey === workKey && currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  return (
    (nowKey === workKey && currentMinutes >= startMinutes) ||
    (nowKey === nextDateKey(workKey) && currentMinutes < endMinutes)
  );
};

const getShiftWindowRelation = (
  { workDate, startTime, endTime },
  now = new Date(),
  timeZone = BUSINESS_TIMEZONE,
) => {
  const startMinutes = parseTime(startTime);
  const endMinutes = parseTime(endTime);
  if (startMinutes === null || endMinutes === null || startMinutes === endMinutes) {
    return 'invalid';
  }

  const nowParts = zonedParts(now, timeZone);
  const workParts = zonedParts(new Date(workDate), timeZone);
  const nowKey = dateKey(nowParts);
  const workKey = dateKey(workParts);
  const currentMinutes = Number(nowParts.hour) * 60 + Number(nowParts.minute);

  if (startMinutes < endMinutes) {
    if (nowKey < workKey || (nowKey === workKey && currentMinutes < startMinutes)) {
      return 'before';
    }
    if (nowKey === workKey && currentMinutes < endMinutes) return 'within';
    return 'after';
  }

  const endKey = nextDateKey(workKey);
  if (nowKey < workKey || (nowKey === workKey && currentMinutes < startMinutes)) {
    return 'before';
  }
  if (
    (nowKey === workKey && currentMinutes >= startMinutes) ||
    (nowKey === endKey && currentMinutes < endMinutes)
  ) {
    return 'within';
  }
  return 'after';
};

module.exports = {
  BUSINESS_TIMEZONE,
  parseTime,
  isWithinOperatingWindow,
  isWithinShiftWindow,
  getShiftWindowRelation,
};
