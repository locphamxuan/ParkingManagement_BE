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

/** Khoá ngày local ("YYYY-MM-DD") — cùng dạng với $dateToString ở các aggregation. */
const localDayKey = (date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

/**
 * Trải một chuỗi thời gian theo ngày ra ĐỦ `days` ngày liên tiếp kết thúc hôm nay,
 * điền 0 cho ngày không có dữ liệu.
 *
 * Aggregation chỉ trả về ngày CÓ bản ghi. Vẽ thẳng kết quả đó lên biểu đồ đường sẽ
 * nối hai ngày cách nhau bằng một đoạn nội suy — người xem đọc ra doanh thu ở những
 * ngày thực tế bằng 0. Điền đủ ngày là điều kiện để biểu đồ nói đúng dữ liệu thật.
 *
 * @param {Array<object>} rows  bản ghi đã group theo ngày, có trường `date`
 * @param {number} days         số ngày của cửa sổ (gồm hôm nay)
 * @param {object} emptyValues  giá trị cho ngày trống (vd `{ revenue: 0, sessions: 0 }`)
 */
const fillDailySeries = (rows, days, emptyValues) => {
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const series = [];
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  cursor.setDate(cursor.getDate() - (days - 1));

  for (let i = 0; i < days; i += 1) {
    const key = localDayKey(cursor);
    series.push(byDate.get(key) || { date: key, ...emptyValues });
    cursor.setDate(cursor.getDate() + 1);
  }
  return series;
};

module.exports = { localUtcOffset, localDayKey, fillDailySeries };
