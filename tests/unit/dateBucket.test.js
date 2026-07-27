/**
 * dateBucket.localUtcOffset — format hoá offset UTC của server thành chuỗi
 * "+HH:MM"/"-HH:MM" cho $dateToString. Bug thật đã phát hiện: thiếu timezone
 * khiến ngày bucket theo UTC lệch với "ngày" local dùng khắp nơi khác trong
 * codebase (dayBounds/localDayKey), gộp nhầm "hôm nay" và "hôm qua" khi giờ
 * local rơi vào khoảng 00:00–07:00 (server UTC+7).
 */
const { localUtcOffset } = require('../../src/utils/dateBucket');

describe('localUtcOffset', () => {
  const withOffset = (minutes, fn) => {
    const spy = jest.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(minutes);
    try {
      return fn();
    } finally {
      spy.mockRestore();
    }
  };

  test('UTC+7 (getTimezoneOffset = -420) → "+07:00"', () => {
    expect(withOffset(-420, localUtcOffset)).toBe('+07:00');
  });

  test('UTC (getTimezoneOffset = 0) → "+00:00"', () => {
    expect(withOffset(0, localUtcOffset)).toBe('+00:00');
  });

  test('UTC-5 (getTimezoneOffset = 300) → "-05:00"', () => {
    expect(withOffset(300, localUtcOffset)).toBe('-05:00');
  });

  test('UTC+5:30 (getTimezoneOffset = -330) → "+05:30"', () => {
    expect(withOffset(-330, localUtcOffset)).toBe('+05:30');
  });
});
