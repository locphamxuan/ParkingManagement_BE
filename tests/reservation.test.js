const mongoose = require('mongoose');
const { connect, clearAll, stop } = require('./db');

const User = require('../src/models/user/User');
const Building = require('../src/models/building/Building');
const VehicleType = require('../src/models/building/VehicleType');
const Floor = require('../src/models/building/Floor');
const ParkingSlot = require('../src/models/building/ParkingSlot');
const PricePolicy = require('../src/models/policy/PricePolicy');
const ReservationPolicy = require('../src/models/policy/ReservationPolicy');
const Reservation = require('../src/models/operations/Reservation');
const WalletTransaction = require('../src/models/finance/WalletTransaction');
const Payment = require('../src/models/finance/Payment');

const reservationSvc = require('../src/services/user/reservation.service');

jest.setTimeout(120000);
const HOUR = 3600 * 1000;
const RATE = 15000;

// start = ngày mai 10:00 (whole-hour, trong 7 ngày, không quá khứ)
const nextDayAt = (h, addDays = 1) => {
  const d = new Date();
  d.setDate(d.getDate() + addDays);
  d.setHours(h, 0, 0, 0);
  return d;
};

const seed = async ({ balance = 1000000, policy = {} } = {}) => {
  const building = await Building.create({ name: 'B', code: 'B1', totalFloors: 1, pricing: { hourlyRate: RATE } });
  const vt = await VehicleType.create({ building: building._id, code: 'CAR', name: 'Ô tô' });
  const floor = await Floor.create({ building: building._id, code: 'F1', name: 'Floor 1', capacity: 10 });
  const slot = await ParkingSlot.create({ building: building._id, floor: floor._id, code: 'A1', vehicleType: vt._id, status: 'available', reservable: true });
  await PricePolicy.create({ building: building._id, vehicleType: vt._id, name: 'Reg', type: 'regular', hourlyRate: RATE });
  await ReservationPolicy.create({ building: building._id, ...policy });
  const user = await User.create({ email: 'r@test.com', password: '123456', fullName: 'R', walletBalance: balance });
  return { building, vt, floor, slot, user };
};

beforeAll(connect);
afterAll(stop);
afterEach(clearAll);

describe('reservation.create (đặt chỗ + cọc + ví)', () => {
  test('thành công: trừ cọc 15%, reservation confirmed, slot reserved, có ledger', async () => {
    const { building, vt, slot, user } = await seed();
    const start = nextDayAt(10);
    const end = new Date(start.getTime() + 2 * HOUR);

    const { reservation, depositAmount, estimatedFee } = await reservationSvc.create(user._id, {
      buildingId: building._id, vehicleTypeId: vt._id, plateNumber: '59G2-83000',
      startTime: start, endTime: end, slotId: slot._id,
    });

    expect(estimatedFee).toBe(2 * RATE); // 30000
    expect(depositAmount).toBe(Math.ceil(2 * RATE * 0.15)); // 4500
    expect(reservation.status).toBe('confirmed');

    const u = await User.findById(user._id).select('walletBalance');
    expect(u.walletBalance).toBe(1000000 - depositAmount);
    expect((await ParkingSlot.findById(slot._id)).status).toBe('reserved');
    expect(await WalletTransaction.findOne({ user: user._id, reason: 'reservation_deposit' })).toBeTruthy();
    expect(await Payment.findOne({ type: 'reservation', status: 'success' })).toBeTruthy();
  });

  test('ví không đủ → lỗi, không tạo reservation, slot vẫn available', async () => {
    const { building, vt, slot, user } = await seed({ balance: 100 });
    const start = nextDayAt(10);
    const end = new Date(start.getTime() + 2 * HOUR);

    await expect(
      reservationSvc.create(user._id, { buildingId: building._id, vehicleTypeId: vt._id, plateNumber: '59G2-83000', startTime: start, endTime: end, slotId: slot._id }),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(await Reservation.countDocuments()).toBe(0);
    expect((await ParkingSlot.findById(slot._id)).status).toBe('available');
  });

  test('vượt thời lượng tối đa/lượt (maxDurationHours) → lỗi', async () => {
    const { building, vt, slot, user } = await seed({ policy: { maxDurationHours: 2 } });
    const start = nextDayAt(10);
    const end = new Date(start.getTime() + 3 * HOUR); // 3h > 2h
    await expect(
      reservationSvc.create(user._id, { buildingId: building._id, vehicleTypeId: vt._id, plateNumber: '59G2-83000', startTime: start, endTime: end, slotId: slot._id }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('đặt quá cửa sổ cho phép (maxAdvanceDays) → lỗi', async () => {
    const { building, vt, slot, user } = await seed({ policy: { maxAdvanceDays: 7 } });
    const start = nextDayAt(10, 9); // 9 ngày tới > 7
    const end = new Date(start.getTime() + 2 * HOUR);
    await expect(
      reservationSvc.create(user._id, { buildingId: building._id, vehicleTypeId: vt._id, plateNumber: '59G2-83000', startTime: start, endTime: end, slotId: slot._id }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
