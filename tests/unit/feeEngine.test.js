/**
 * feeEngine — lõi tính phí (split peak/regular theo phút). Test thuần, không DB:
 * truyền preloadedPolicies (plain object) để bỏ qua truy vấn PricePolicy.
 */
const { computeFee, calculateTotalPeakMinutes } = require('../../src/utils/feeEngine');

const policy = (over) => ({
  isActive: true,
  effectiveFrom: new Date('2000-01-01'),
  effectiveTo: null,
  createdAt: new Date('2020-01-01'),
  type: 'regular',
  hourlyRate: 10000,
  timeWindow: { from: '00:00', to: '23:59' },
  ...over,
});

describe('calculateTotalPeakMinutes', () => {
  test('khung peak ban ngày chồng một phần khoảng đỗ', () => {
    const start = new Date(2026, 0, 1, 12, 0, 0).getTime(); // 12:00
    const end = new Date(2026, 0, 1, 14, 0, 0).getTime();   // 14:00
    // Peak 13:00–14:00 → 60 phút chồng.
    expect(calculateTotalPeakMinutes(start, end, '13:00', '14:00')).toBe(60);
  });

  test('khung peak qua nửa đêm (22:00–06:00)', () => {
    const start = new Date(2026, 0, 1, 21, 0, 0).getTime(); // 21:00
    const end = new Date(2026, 0, 1, 23, 0, 0).getTime();   // 23:00
    // Chỉ 22:00–23:00 nằm trong peak → 60 phút.
    expect(calculateTotalPeakMinutes(start, end, '22:00', '06:00')).toBe(60);
  });

  test('không chồng peak → 0', () => {
    const start = new Date(2026, 0, 1, 8, 0, 0).getTime();
    const end = new Date(2026, 0, 1, 9, 0, 0).getTime();
    expect(calculateTotalPeakMinutes(start, end, '13:00', '14:00')).toBe(0);
  });
});

describe('computeFee', () => {
  test('chỉ regular policy: phí = rate/60 × số phút', async () => {
    const start = new Date(2026, 0, 1, 12, 0, 0);
    const end = new Date(2026, 0, 1, 14, 0, 0); // 2 giờ
    const r = await computeFee({
      start, end,
      preloadedPolicies: [policy({ hourlyRate: 10000 })],
    });
    expect(r.hasPolicy).toBe(true);
    expect(r.totalMinutes).toBe(120);
    expect(r.peakMinutes).toBe(0);
    expect(r.regularMinutes).toBe(120);
    expect(r.fee).toBe(20000); // 10000/60*120
  });

  test('split peak + regular theo từng phút', async () => {
    const start = new Date(2026, 0, 1, 12, 0, 0);
    const end = new Date(2026, 0, 1, 14, 0, 0); // 2 giờ
    const r = await computeFee({
      start, end,
      preloadedPolicies: [
        policy({ type: 'regular', hourlyRate: 10000 }),
        policy({ type: 'peak', hourlyRate: 30000, timeWindow: { from: '13:00', to: '14:00' } }),
      ],
    });
    expect(r.peakMinutes).toBe(60);
    expect(r.regularMinutes).toBe(60);
    // peak 30000/60*60=30000 + regular 10000/60*60=10000
    expect(r.fee).toBe(40000);
    expect(r.peakRate).toBe(30000);
    expect(r.regularRate).toBe(10000);
  });

  test('không có policy hiệu lực → hasPolicy=false, fee=0', async () => {
    const start = new Date(2026, 0, 1, 12, 0, 0);
    const end = new Date(2026, 0, 1, 14, 0, 0);
    const r = await computeFee({ start, end, preloadedPolicies: [] });
    expect(r.hasPolicy).toBe(false);
    expect(r.fee).toBe(0);
    expect(r.totalMinutes).toBe(120);
  });

  test('end <= start → rỗng (fee 0, totalMinutes 0)', async () => {
    const t = new Date(2026, 0, 1, 12, 0, 0);
    const r = await computeFee({ start: t, end: t, preloadedPolicies: [policy()] });
    expect(r.fee).toBe(0);
    expect(r.totalMinutes).toBe(0);
    expect(r.hasPolicy).toBe(false);
  });

  test('bỏ qua policy đã hết hiệu lực (effectiveTo trong quá khứ)', async () => {
    const start = new Date(2026, 0, 1, 12, 0, 0);
    const end = new Date(2026, 0, 1, 14, 0, 0);
    const r = await computeFee({
      start, end,
      preloadedPolicies: [policy({ effectiveTo: new Date('2025-01-01') })],
    });
    expect(r.hasPolicy).toBe(false);
  });
});
