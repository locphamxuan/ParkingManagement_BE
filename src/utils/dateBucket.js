// Mongo's $dateToString/$dateTrunc default to UTC. Every "day" concept elsewhere
// in this codebase (dayBounds/localDayKey in buildingWallet.service.js, revenue
// dashboards) uses the server's LOCAL time — without an explicit timezone, day
// bucketing in an aggregation silently uses UTC days instead, which collide with
// local days near local midnight (e.g. 00:00–07:00 local in a UTC+7 server).
const pad2 = (n) => String(n).padStart(2, '0');

/** Server's local UTC offset as "+HH:MM"/"-HH:MM", for $dateToString's `timezone` option. */
const localUtcOffset = () => {
  const offsetMin = -new Date().getTimezoneOffset(); // JS offset is inverted (UTC - local)
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  return `${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
};

module.exports = { localUtcOffset };
