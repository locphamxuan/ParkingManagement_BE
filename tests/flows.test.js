// Mock email để không gọi SMTP thật trong test.
jest.mock('../src/utils/email', () => ({
  sendNotificationEmail: jest.fn(),
  sendOtpEmail: jest.fn(),
  sendResetPasswordEmail: jest.fn(),
}));

const mongoose = require('mongoose');
const { connect, clearAll, stop } = require('./db');

const Building = require('../src/models/building/Building');
const VehicleType = require('../src/models/building/VehicleType');
const Floor = require('../src/models/building/Floor');
const ParkingSlot = require('../src/models/building/ParkingSlot');
const PricePolicy = require('../src/models/policy/PricePolicy');
const ReservationPolicy = require('../src/models/policy/ReservationPolicy');
const LongTermPackage = require('../src/models/policy/LongTermPackage');
const LongTermSubscription = require('../src/models/policy/LongTermSubscription');
const Reservation = require('../src/models/operations/Reservation');
const { ParkingSession } = require('../src/models');

const svc = require('../src/services/staff/parkingSession.service');

jest.setTimeout(120000);

const HOUR = 3600 * 1000;
const RATE = 15000; // regular rate dùng cho mọi test (phân biệt với fallback 20k)

// Phí phụ thuộc thời gian thực (vài giây trôi giữa setup→checkout) nên dùng dung sai.
const approxFee = (actual, target, slack = 600) => {
  expect(actual).toBeGreaterThanOrEqual(target);
  expect(actual).toBeLessThan(target + slack);
};

const seedBase = async () => {
  const building = await Building.create({
    name: 'B1', code: 'B1', totalFloors: 1, pricing: { hourlyRate: RATE },
  });
  const vt = await VehicleType.create({ building: building._id, code: 'CAR', name: 'Ô tô' });
  const floor = await Floor.create({ building: building._id, code: 'F1', capacity: 100 });
  await PricePolicy.create({ building: building._id, vehicleType: vt._id, name: 'Reg', type: 'regular', hourlyRate: RATE });
  await ReservationPolicy.create({ building: building._id });
  const staff = { _id: new mongoose.Types.ObjectId(), assignedBuildings: [building._id] };
  return { building, vt, floor, staff };
};

beforeAll(connect);
afterAll(stop);
afterEach(clearAll);

describe('Walk-in (khách vãng lai)', () => {
  test('thiếu ảnh chân dung → PORTRAIT_REQUIRED (áp dụng mọi check-in)', async () => {
    const { building, staff } = await seedBase();
    await ParkingSlot.create({ building: building._id, floor: (await Floor.findOne())._id, code: 'A1' });
    await expect(
      svc.checkIn(staff, { building: building._id, plateNumber: '59G2-10000', vehicleType: 'car' }),
    ).rejects.toMatchObject({ errorCode: 'PORTRAIT_REQUIRED' });
  });

  test('vãng lai có chân dung nhưng thiếu ảnh biển → WALKIN_PLATE_IMAGE_REQUIRED', async () => {
    const { building, staff } = await seedBase();
    await ParkingSlot.create({ building: building._id, floor: (await Floor.findOne())._id, code: 'A1' });
    await expect(
      svc.checkIn(staff, { building: building._id, plateNumber: '59G2-10000', vehicleType: 'car', portraitImage: 'FACE_IN' }),
    ).rejects.toMatchObject({ errorCode: 'WALKIN_PLATE_IMAGE_REQUIRED' });
  });

  test('đủ ảnh → tạo session; checkout lưu ảnh ra + tính phí theo policy', async () => {
    const { building, vt, staff } = await seedBase();
    const session = await svc.checkIn(staff, {
      building: building._id, plateNumber: '59G2-10000', vehicleType: 'car',
      plateImage: 'PLATE_IN', portraitImage: 'FACE_IN',
    });
    expect(session.status).toBe('active');
    expect(session.user).toBeNull();
    expect(session.portraitImage).toBe('FACE_IN');

    // entryTime lùi 2h để phí theo policy (2h * 15000 = 30000, khác fallback 20000).
    await ParkingSession.updateOne({ _id: session._id }, { $set: { entryTime: new Date(Date.now() - 2 * HOUR) } });

    const done = await svc.checkOut(staff, session._id, {
      paymentMethod: 'cash', exitPlateImage: 'PLATE_OUT', exitPortraitImage: 'FACE_OUT',
    });
    expect(done.status).toBe('completed');
    approxFee(done.fee, 2 * RATE); // 2h * policy
    expect(done.exitPortraitImage).toBe('FACE_OUT');
  });
});

describe('Capacity bypass cho gói có slot cố định', () => {
  test('vãng lai bị chặn khi đầy; gói có slot cố định vẫn vào', async () => {
    const { building, vt, floor, staff } = await seedBase();
    // 1 slot duy nhất (đang reserved cho gói) → totalSlots = 1
    const slot = await ParkingSlot.create({ building: building._id, floor: floor._id, code: 'A1', status: 'reserved' });
    // 1 session active → activeSessions = 1 → đầy
    await ParkingSession.create({ building: building._id, plateNumber: '59G2-000.01', vehicleType: vt._id, status: 'active' });

    // walk-in (đủ ảnh) → at capacity
    await expect(
      svc.checkIn(staff, { building: building._id, plateNumber: '59G2-20000', vehicleType: 'car', plateImage: 'x', portraitImage: 'y' }),
    ).rejects.toMatchObject({ statusCode: 409 });

    // gói có slot cố định
    const pkg = await LongTermPackage.create({ building: building._id, vehicleType: vt._id, name: 'M', code: 'M1', durationDays: 30, price: 100, maxHoursPerDay: 5 });
    await LongTermSubscription.create({
      user: new mongoose.Types.ObjectId(), package: pkg._id, building: building._id,
      plateNumber: '59G2-300.00', slot: slot._id, status: 'active',
      startDate: new Date(Date.now() - HOUR), endDate: new Date(Date.now() + 30 * 24 * HOUR),
    });
    // user mua gói VẪN phải có ảnh chân dung (chống người khác lấy xe)
    const session = await svc.checkIn(staff, { building: building._id, plateNumber: '59G2-300.00', vehicleType: 'car', portraitImage: 'FACE_IN' });
    expect(session.paymentMethod).toBe('long_term');
    expect(session.fee).toBe(0);
    expect(session.portraitImage).toBe('FACE_IN');
  });
});

describe('Gói dài hạn — checkout & overage giờ/ngày', () => {
  const makePackageSession = async (building, vt, hoursAgo, maxHoursPerDay) => {
    const pkg = await LongTermPackage.create({ building: building._id, vehicleType: vt._id, name: 'M', code: 'M1', durationDays: 30, price: 100, maxHoursPerDay });
    const sub = await LongTermSubscription.create({
      user: new mongoose.Types.ObjectId(), package: pkg._id, building: building._id,
      plateNumber: '59G2-400.00', status: 'active',
      startDate: new Date(Date.now() - HOUR), endDate: new Date(Date.now() + 30 * 24 * HOUR),
    });
    return ParkingSession.create({
      building: building._id, plateNumber: '59G2-400.00', vehicleType: vt._id, user: sub.user,
      status: 'active', paymentMethod: 'long_term', note: `long_term:${sub._id}`,
      entryTime: new Date(Date.now() - hoursAgo * HOUR),
    });
  };

  test('trong hạn mức → checkout MIỄN PHÍ', async () => {
    const { building, vt, staff } = await seedBase();
    const ps = await makePackageSession(building, vt, 4, 5); // đỗ 4h, cap 5h
    const done = await svc.checkOut(staff, ps._id, {});
    expect(done.fee).toBe(0);
    expect(done.status).toBe('completed');
  });

  // Số tiền phần vượt được kiểm chính xác (deterministic) ở usage.test.js qua
  // computeDailyOverageHours; ở đây chỉ xác nhận checkout thành công.
});

describe('Reservation — overstay + thanh toán tiền mặt; chặn check-in sớm', () => {
  test('overstay: thu phần còn lại + phần đỗ quá giờ; cash không cần ví', async () => {
    const { building, vt, staff } = await seedBase();
    const res = await Reservation.create({
      code: 'RSV-1', user: new mongoose.Types.ObjectId(), building: building._id, vehicleType: vt._id,
      plateNumber: '59G2-500.00', startTime: new Date(Date.now() - 4 * HOUR), endTime: new Date(Date.now() - 2 * HOUR),
      fee: 3000, estimatedFee: 20000, status: 'confirmed',
    });
    const ps = await ParkingSession.create({
      building: building._id, plateNumber: '59G2-500.00', vehicleType: vt._id, user: res.user,
      reservation: res._id, status: 'active', entryTime: new Date(Date.now() - 4 * HOUR),
    });
    const done = await svc.checkOut(staff, ps._id, { paymentMethod: 'cash' });
    // (estimatedFee - deposit) + overstay(2h*15000) = 17000 + 30000
    approxFee(done.fee, 17000 + 2 * RATE);
    const r = await Reservation.findById(res._id);
    expect(r.status).toBe('completed');
  });

  test('overstay + phụ phí phạt: phần đỗ quá giờ × (1 + penalty%)', async () => {
    const { building, vt, staff } = await seedBase();
    // Manager đặt phạt 50% cho phần overstay.
    await ReservationPolicy.updateOne({ building: building._id }, { $set: { overstayPenaltyPercent: 50 } });
    const res = await Reservation.create({
      code: 'RSV-PEN', user: new mongoose.Types.ObjectId(), building: building._id, vehicleType: vt._id,
      plateNumber: '59G2-510.00', startTime: new Date(Date.now() - 4 * HOUR), endTime: new Date(Date.now() - 2 * HOUR),
      fee: 3000, estimatedFee: 20000, status: 'confirmed',
    });
    const ps = await ParkingSession.create({
      building: building._id, plateNumber: '59G2-510.00', vehicleType: vt._id, user: res.user,
      reservation: res._id, status: 'active', entryTime: new Date(Date.now() - 4 * HOUR),
    });
    const done = await svc.checkOut(staff, ps._id, { paymentMethod: 'cash' });
    // (estimatedFee - deposit) + overstay(2h*15000)*1.5 = 17000 + 45000
    approxFee(done.fee, 17000 + Math.ceil(2 * RATE * 1.5), 1000);
  });

  test('check-in trước giờ bắt đầu → RESERVATION_TOO_EARLY', async () => {
    const { building, vt, floor, staff } = await seedBase();
    await ParkingSlot.create({ building: building._id, floor: floor._id, code: 'A1' });
    await Reservation.create({
      code: 'RSV-2', user: new mongoose.Types.ObjectId(), building: building._id, vehicleType: vt._id,
      plateNumber: '59G2-600.00', startTime: new Date(Date.now() + 3 * HOUR), status: 'confirmed',
    });
    await expect(
      svc.checkIn(staff, { building: building._id, plateNumber: '59G2-600.00', vehicleType: 'car', plateImage: 'x', portraitImage: 'y' }),
    ).rejects.toMatchObject({ errorCode: 'RESERVATION_TOO_EARLY' });
  });
});
