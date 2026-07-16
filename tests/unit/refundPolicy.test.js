/** unit: clampPercent + DEFAULT_REFUND_PERCENT — nguồn default hoàn tiền duy nhất toàn hệ thống. */
const { clampPercent, DEFAULT_REFUND_PERCENT } = require('../../src/utils/refundPolicy');

describe('clampPercent', () => {
  test('null/undefined → fallback', () => {
    expect(clampPercent(undefined, DEFAULT_REFUND_PERCENT)).toBe(80);
    expect(clampPercent(null, 15)).toBe(15);
  });

  test('kẹp về [0, 100]', () => {
    expect(clampPercent(-10, 80)).toBe(0);
    expect(clampPercent(150, 80)).toBe(100);
    expect(clampPercent(55, 80)).toBe(55);
  });

  test('giá trị không phải số (NaN/chuỗi rác) → fallback', () => {
    expect(clampPercent('abc', 80)).toBe(80);
    expect(clampPercent(NaN, 80)).toBe(80);
  });

  test('0 là giá trị hợp lệ (manager cố ý tắt hoàn tiền) — không bị đổi thành default', () => {
    expect(clampPercent(0, 80)).toBe(0);
  });

  test('DEFAULT_REFUND_PERCENT = 80 (khớp DEFAULTS của reservationPolicy.service)', () => {
    expect(DEFAULT_REFUND_PERCENT).toBe(80);
  });
});
