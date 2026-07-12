const mongoose = require('mongoose');
const { connect, clearAll, stop } = require('./db');
const PricePolicy = require('../src/models/policy/PricePolicy');
const { computeFee, calculateParkingFee, calculateReservationFee } = require('../src/utils/feeEngine');

jest.setTimeout(120000);

const building = new mongoose.Types.ObjectId();
const vt = new mongoose.Types.ObjectId();

// effectiveFrom cố định trong quá khứ để policy luôn hiệu lực bất kể ngày chạy test.
const EFF_FROM = new Date('2020-01-01');

const seedRegular = (rate = 10000) =>
  PricePolicy.create({ building, vehicleType: vt, name: 'Regular', type: 'regular', hourlyRate: rate, effectiveFrom: EFF_FROM });

const seedPeak = (from, to, rate) =>
  PricePolicy.create({ building, vehicleType: vt, name: `Peak ${from}-${to}`, type: 'peak', hourlyRate: rate, timeWindow: { from, to }, effectiveFrom: EFF_FROM });

// 12/06/2026 — ngày cố định để tính giờ ổn định.
const d = (hhmm) => new Date(`2026-06-12T${hhmm}:00`);

beforeAll(connect);
afterAll(stop);
afterEach(clearAll);

describe('feeEngine.computeFee', () => {
  test('regular only: 2h @ 10k = 20000', async () => {
    await seedRegular(10000);
    const r = await computeFee({ buildingId: building, vehicleTypeId: vt, start: d('08:00'), end: d('10:00') });
    expect(r.hasPolicy).toBe(true);
    expect(r.fee).toBe(20000);
    expect(r.peakMinutes).toBe(0);
  });

  test('regular + 1 peak window split by minute', async () => {
    await seedRegular(10000);
    await seedPeak('07:00', '09:00', 20000);
    // 06:00–10:00 = 120' regular (06-07,09-10) + 120' peak (07-09)
    const r = await computeFee({ buildingId: building, vehicleTypeId: vt, start: d('06:00'), end: d('10:00') });
    expect(r.peakMinutes).toBe(120);
    expect(r.regularMinutes).toBe(120);
    expect(r.fee).toBe(20000 + 40000); // 120/60*10k + 120/60*20k
  });

  test('MULTIPLE peak windows each at own rate', async () => {
    await seedRegular(10000);
    await seedPeak('07:00', '09:00', 20000);
    await seedPeak('17:00', '19:00', 30000);
    // 16:00–20:00 = 16-17 reg(60) + 17-19 peak(120@30k) + 19-20 reg(60)
    const r = await computeFee({ buildingId: building, vehicleTypeId: vt, start: d('16:00'), end: d('20:00') });
    expect(r.peakMinutes).toBe(120);
    expect(r.fee).toBe(20000 + 60000); // 120 reg@10k + 120 peak@30k
  });

  test('effectiveFrom in the FUTURE is ignored', async () => {
    await PricePolicy.create({
      building, vehicleType: vt, name: 'Future', type: 'regular', hourlyRate: 99000,
      effectiveFrom: new Date('2999-01-01'),
    });
    const r = await computeFee({ buildingId: building, vehicleTypeId: vt, start: d('08:00'), end: d('10:00') });
    expect(r.hasPolicy).toBe(false);
    expect(r.fee).toBe(0);
  });
});

describe('checkout vs reservation-estimate consistency (the merge)', () => {
  test('calculateParkingFee == computeFee.fee', async () => {
    await seedRegular(10000);
    await seedPeak('07:00', '09:00', 20000);
    const fee = await calculateParkingFee(building, vt, d('06:00'), d('10:00'));
    const r = await computeFee({ buildingId: building, vehicleTypeId: vt, start: d('06:00'), end: d('10:00') });
    expect(fee).toBe(r.fee);
  });

  test('reservation estimate == actual checkout fee on a peak BOUNDARY (split-minute)', async () => {
    await seedRegular(10000);
    await seedPeak('07:00', '09:00', 20000);
    // 06:30–07:30 = 30' regular (5000) + 30' peak (10000) = 15000
    const actual = await calculateParkingFee(building, vt, d('06:30'), d('07:30'));
    const est = await calculateReservationFee(building, vt, d('06:30'), d('07:30'));
    expect(actual).toBe(15000);
    expect(est.estimatedFee).toBe(actual); // hai bên nhất quán
  });

  test('reservation estimate fallback when building has no PricePolicy', async () => {
    // không seed policy → dùng FALLBACK_HOURLY_RATE (5000) cho 2h = 10000
    const est = await calculateReservationFee(building, vt, d('08:00'), d('10:00'));
    expect(est.estimatedFee).toBe(10000);
  });
});
