const mongoose = require('mongoose');
const { connect, clearAll, stop } = require('./db');
const { ParkingSession } = require('../src/models');
const { computeDailyOverageHours, defaultMaxHoursByDuration } = require('../src/utils/longTermUsage');

jest.setTimeout(120000);

const building = new mongoose.Types.ObjectId();
const PLATE = '59G2-700.00';
const d = (hhmm) => new Date(`2026-06-12T${hhmm}:00`);

beforeAll(connect);
afterAll(stop);
afterEach(clearAll);

describe('defaultMaxHoursByDuration (tuần 5 / tháng 7 / năm 10)', () => {
  test.each([[7, 5], [1, 5], [30, 7], [15, 7], [365, 10], [60, 10]])(
    'durationDays=%i → %ih/ngày', (days, hours) => {
      expect(defaultMaxHoursByDuration(days)).toBe(hours);
    },
  );
});

describe('computeDailyOverageHours (cộng dồn theo ngày)', () => {
  test('1 phiên 8h, cap 5 → vượt 3h', async () => {
    const overage = await computeDailyOverageHours({
      plateNumber: PLATE, building, entryTime: d('08:00'), exitTime: d('16:00'),
      excludeSessionId: new mongoose.Types.ObjectId(), maxHoursPerDay: 5,
    });
    expect(overage).toBe(3);
  });

  test('trong hạn mức → 0', async () => {
    const overage = await computeDailyOverageHours({
      plateNumber: PLATE, building, entryTime: d('08:00'), exitTime: d('12:00'),
      excludeSessionId: new mongoose.Types.ObjectId(), maxHoursPerDay: 5,
    });
    expect(overage).toBe(0);
  });

  test('maxHoursPerDay=0 (không giới hạn) → 0', async () => {
    const overage = await computeDailyOverageHours({
      plateNumber: PLATE, building, entryTime: d('00:00'), exitTime: d('23:00'),
      excludeSessionId: new mongoose.Types.ObjectId(), maxHoursPerDay: 0,
    });
    expect(overage).toBe(0);
  });

  test('CỘNG DỒN: phiên trước 4h + phiên này 3h, cap 5 → vượt 2h', async () => {
    // phiên đã hoàn thành cùng ngày: 08:00–12:00 (4h)
    await ParkingSession.create({
      building, plateNumber: PLATE, status: 'completed', paymentMethod: 'long_term',
      entryTime: d('08:00'), exitTime: d('12:00'),
    });
    // phiên hiện tại 13:00–16:00 (3h): free còn 1h → vượt 2h
    const overage = await computeDailyOverageHours({
      plateNumber: PLATE, building, entryTime: d('13:00'), exitTime: d('16:00'),
      excludeSessionId: new mongoose.Types.ObjectId(), maxHoursPerDay: 5,
    });
    expect(overage).toBe(2);
  });
});
