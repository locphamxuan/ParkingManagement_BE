/** Quy tắc đặt chỗ theo giờ NGUYÊN (assertWholeHourDuration) — test thuần. */
const { assertWholeHourDuration } = require('../../src/services/user/reservation.service');

const hoursApart = (h) => {
  const start = new Date(2026, 0, 1, 8, 0, 0);
  const end = new Date(start.getTime() + h * 3_600_000);
  return { start, end };
};

test('1, 2, 3 giờ nguyên → hợp lệ, trả về số giờ', () => {
  expect(assertWholeHourDuration(...Object.values(hoursApart(1)))).toBe(1);
  expect(assertWholeHourDuration(...Object.values(hoursApart(3)))).toBe(3);
});

test('1.5 giờ → ném INVALID_RESERVATION_DURATION', () => {
  const { start, end } = hoursApart(1.5);
  expect(() => assertWholeHourDuration(start, end)).toThrow(/nguyên/);
});

test('< 1 giờ → ném lỗi', () => {
  const { start, end } = hoursApart(0.5);
  expect(() => assertWholeHourDuration(start, end)).toThrow();
});
