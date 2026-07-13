/**
 * Integration test cho lõi đặt chỗ của USER (reservation.service):
 * cọc theo %, chặn overbooking, chặn slot gói dài hạn, số dư ví không đủ,
 * giờ nguyên, và hoàn tiền khi hủy. Chạy trên MongoMemoryReplSet (cần transaction).
 */
const mongoose = require('mongoose');
const db = require('../helpers/db');
const reservationService = require('../../src/services/user/reservation.service');

const User = require('../../src/models/user/User');
const Building = require('../../src/models/building/Building');
const VehicleType = require('../../src/models/building/VehicleType');
const Floor = require('../../src/models/building/Floor');
const ParkingSlot = require('../../src/models/building/ParkingSlot');
const ReservationPolicy = require('../../src/models/policy/ReservationPolicy');
const Reservation = require('../../src/models/operations/Reservation');

let building, vehicleType, floor, user;

// Khung giờ đặt: ngày mai 10:00–12:00 (2 giờ nguyên, trong cửa sổ đặt trước).
const bookingWindow = () => {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(10, 0, 0, 0);
  const end = new Date(start);
  end.setHours(12, 0, 0, 0);
  return { start, end };
};

const seedSlots = async (n, over = {}) => {
  const slots = [];
  for (let i = 0; i < n; i += 1) {
    slots.push(await ParkingSlot.create({
      building: building._id,
      floor: floor._id,
      code: `A${i + 1}`,
      status: 'available',
      reservable: true,
      ...over,
    }));
  }
  return slots;
};

beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });

beforeEach(async () => {
  await db.clear();
  building = await Building.create({
    name: 'Tòa A', code: 'BLD-A', totalFloors: 1,
    pricing: { hourlyRate: 10000 },
    operatingHours: { open: '00:00', close: '23:59' },
  });
  vehicleType = await VehicleType.create({ building: building._id, code: 'CAR', name: 'Ô tô' });
  floor = await Floor.create({ building: building._id, code: 'F1', name: 'Floor 1', capacity: 100 });
  await ReservationPolicy.create({
    building: building._id, depositPercent: 15, refundPercent: 80,
    maxDurationHours: 24, maxAdvanceDays: 7, cancellationCutoffHours: 0,
  });
  user = await User.create({
    email: 'u@test.com', password: 'secret1', fullName: 'User Test', walletBalance: 100000,
  });
});

describe('create — cọc theo %', () => {
  test('thu đúng 15% phí ước tính, trừ ví, tạo reservation confirmed', async () => {
    await seedSlots(3);
    const { start, end } = bookingWindow();
    const { reservation, depositAmount, estimatedFee } = await reservationService.create(user._id, {
      buildingId: building._id, vehicleTypeId: vehicleType._id,
      plateNumber: '51F-12345', startTime: start, endTime: end,
    });

    expect(estimatedFee).toBe(20000);       // 10000đ/h × 2h (fallback Building.pricing)
    expect(depositAmount).toBe(3000);        // 15%
    expect(reservation.status).toBe('confirmed');
    expect(reservation.fee).toBe(3000);
    expect(reservation.estimatedFee).toBe(20000);

    const after = await User.findById(user._id);
    expect(after.walletBalance).toBe(97000); // 100000 − 3000
  });

  test('số dư ví không đủ cọc → chặn (400)', async () => {
    await seedSlots(3);
    await User.findByIdAndUpdate(user._id, { walletBalance: 1000 });
    const { start, end } = bookingWindow();
    await expect(reservationService.create(user._id, {
      buildingId: building._id, vehicleTypeId: vehicleType._id,
      plateNumber: '51F-12345', startTime: start, endTime: end,
    })).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('create — ràng buộc', () => {
  test('thời lượng không nguyên giờ → INVALID_RESERVATION_DURATION', async () => {
    await seedSlots(1);
    const { start } = bookingWindow();
    const end = new Date(start.getTime() + 90 * 60 * 1000); // 1.5h
    await expect(reservationService.create(user._id, {
      buildingId: building._id, vehicleTypeId: vehicleType._id,
      plateNumber: '51F-12345', startTime: start, endTime: end,
    })).rejects.toMatchObject({ errorCode: 'INVALID_RESERVATION_DURATION' });
  });

  test('overbooking: số đặt chỗ chồng khung giờ ≥ tổng slot → BUILDING_FULLY_BOOKED', async () => {
    await seedSlots(1); // tổng 1 slot
    const { start, end } = bookingWindow();
    // Một đặt chỗ confirmed đã chiếm khung giờ này.
    await Reservation.create({
      code: 'RSV-EXIST', user: user._id, building: building._id, vehicleType: vehicleType._id,
      plateNumber: '99Z-99999', startTime: start, endTime: end, status: 'confirmed',
    });
    await expect(reservationService.create(user._id, {
      buildingId: building._id, vehicleTypeId: vehicleType._id,
      plateNumber: '51F-12345', startTime: start, endTime: end,
    })).rejects.toMatchObject({ errorCode: 'BUILDING_FULLY_BOOKED' });
  });

  test('đặt vào slot thuộc dãy gói dài hạn (subscriber) → SLOT_USAGE_MISMATCH', async () => {
    const [subSlot] = await seedSlots(1, { usageType: 'subscriber' });
    const { start, end } = bookingWindow();
    await expect(reservationService.create(user._id, {
      buildingId: building._id, vehicleTypeId: vehicleType._id,
      plateNumber: '51F-12345', startTime: start, endTime: end, slotId: subSlot._id,
    })).rejects.toMatchObject({ errorCode: 'SLOT_USAGE_MISMATCH' });
  });
});

describe('cancel — hoàn tiền theo %', () => {
  test('hủy hoàn refundPercent% cọc vào ví, đánh dấu cancelled', async () => {
    await seedSlots(3);
    const { start, end } = bookingWindow();
    const { reservation } = await reservationService.create(user._id, {
      buildingId: building._id, vehicleTypeId: vehicleType._id,
      plateNumber: '51F-12345', startTime: start, endTime: end,
    });
    // Ví sau khi đặt = 97000 (đã trừ 3000 cọc).

    const outcome = await reservationService.cancel(user._id, reservation._id);
    expect(outcome.refundPercent).toBe(80);
    expect(outcome.amountPaid).toBe(3000);
    expect(outcome.refund).toBe(2400); // 80% × 3000

    const after = await User.findById(user._id);
    expect(after.walletBalance).toBe(99400); // 97000 + 2400 hoàn
    const cancelled = await Reservation.findById(reservation._id);
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.cancelledAt).toBeTruthy();
  });
});
