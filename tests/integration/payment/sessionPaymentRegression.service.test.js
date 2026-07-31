jest.mock('../../../src/services/payment/payos.service', () => ({
  generateOrderCode: jest.fn(() => 730001),
  createPaymentLink: jest.fn(async () => ({
    checkoutUrl: 'https://pay/session',
    qrCode: 'QR',
    paymentLinkId: 'session-link',
  })),
  getPaymentLink: jest.fn(async () => ({ status: 'PAID' })),
}));

const mongoose = require('mongoose');
const db = require('../../helpers/db');
const f = require('../../helpers/fixtures');
const Payment = require('../../../src/models/finance/Payment');
const ParkingSession = require('../../../src/models/operations/ParkingSession');
const ParkingSlot = require('../../../src/models/building/ParkingSlot');
const LongTermSubscription = require('../../../src/models/policy/LongTermSubscription');
const paymentService = require('../../../src/services/staff/parkingSession/payment.service');
const payosService = require('../../../src/services/payment/payos.service');

const EXIT_EVIDENCE = {
  exitPlateImage: 'exit-plate',
  exitPortraitImage: 'exit-portrait',
};

beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.clear();
  jest.clearAllMocks();
  payosService.generateOrderCode.mockReturnValue(730001);
});

const seedSession = async () => {
  const building = await f.createBuilding();
  const vehicleType = await f.createVehicleType(building._id);
  await f.createPricePolicy(building._id, vehicleType._id, { hourlyRate: 15000 });
  const staff = { _id: new mongoose.Types.ObjectId(), assignedBuildings: [building._id] };
  const shift = await f.createShift(building._id, {
    code: 'ALL_DAY',
    startTime: '00:00',
    endTime: '23:59',
  });
  await f.createStaffShift(building._id, staff._id, shift._id, { workDate: new Date() });
  const parkingSession = await ParkingSession.create({
    building: building._id,
    plateNumber: '51F-888.88',
    vehicleType: vehicleType._id,
    status: 'active',
    entryTime: new Date(Date.now() - 2 * 60 * 60 * 1000),
  });
  return { building, vehicleType, staff, parkingSession };
};

test('two initiation requests reuse one pending intent', async () => {
  const { staff, parkingSession } = await seedSession();

  const first = await paymentService.initiatePayment(staff, parkingSession._id, EXIT_EVIDENCE);
  const second = await paymentService.initiatePayment(staff, parkingSession._id, EXIT_EVIDENCE);

  expect(second.orderCode).toBe(first.orderCode);
  expect(await Payment.countDocuments({
    parkingSession: parkingSession._id,
    method: 'payos',
    status: 'pending',
  })).toBe(1);
  expect(payosService.createPaymentLink).toHaveBeenCalledTimes(1);
});

test('an expired PayOS link is retired before a new QR is created', async () => {
  const { staff, parkingSession } = await seedSession();
  payosService.generateOrderCode
    .mockReturnValueOnce(730001)
    .mockReturnValueOnce(730002);

  await paymentService.initiatePayment(staff, parkingSession._id, EXIT_EVIDENCE);
  payosService.getPaymentLink.mockResolvedValueOnce({ status: 'EXPIRED' });

  const replacement = await paymentService.initiatePayment(staff, parkingSession._id, EXIT_EVIDENCE);

  expect(replacement.orderCode).toBe(730002);
  expect((await Payment.findOne({ payosOrderCode: 730001 })).status).toBe('failed');
  expect(await Payment.countDocuments({
    parkingSession: parkingSession._id,
    method: 'payos',
    status: 'pending',
  })).toBe(1);
});

// Khách quét QR CŨ sau khi xe đã ra bằng đường khác (vd staff thu tiền mặt lúc QR
// còn pending): tiền có thật nhưng phiên không còn active → phải chuyển
// 'reconciliation_required' để đối soát, KHÔNG âm thầm cộng ví toà.
test('a paid order for a session that is no longer active requires reconciliation', async () => {
  const { staff, parkingSession } = await seedSession();
  await paymentService.initiatePayment(staff, parkingSession._id, EXIT_EVIDENCE);
  await ParkingSession.updateOne({ _id: parkingSession._id }, { $set: { status: 'completed' } });

  const settlement = await paymentService.settleSessionPayment(730001);

  expect(settlement).toEqual({ settled: false, status: 'reconciliation_required' });
  expect((await Payment.findOne({ payosOrderCode: 730001 })).status)
    .toBe('reconciliation_required');
});

// Chốt chặn DB: không thể tồn tại 2 ý định PayOS còn sống/đã thu trên cùng 1 phiên.
test('the database rejects a second live PayOS intent for one session', async () => {
  const { staff, parkingSession } = await seedSession();
  await paymentService.initiatePayment(staff, parkingSession._id, EXIT_EVIDENCE);

  await expect(Payment.create({
    building: parkingSession.building,
    parkingSession: parkingSession._id,
    type: 'session',
    method: 'payos',
    amount: 30000,
    status: 'pending',
    payosOrderCode: 730099,
  })).rejects.toMatchObject({ code: 11000 });
});

test('PayOS checkout restores an active fixed slot to reserved', async () => {
  const { building, vehicleType, staff, parkingSession } = await seedSession();
  const floor = await f.createFloor(building._id);
  const slot = await f.createSlot(building._id, floor._id, {
    status: 'occupied',
    usageType: 'subscriber',
    vehicleType: vehicleType._id,
  });
  const pkg = await f.createPackage(building._id, vehicleType._id);
  const subscription = await LongTermSubscription.create({
    user: new mongoose.Types.ObjectId(),
    package: pkg._id,
    building: building._id,
    plateNumber: parkingSession.plateNumber,
    slot: slot._id,
    startDate: new Date(Date.now() - 60_000),
    endDate: new Date(Date.now() + 86_400_000),
    status: 'active',
  });
  await ParkingSession.updateOne(
    { _id: parkingSession._id },
    { $set: { slot: slot._id, note: `long_term:${subscription._id}` } },
  );

  await paymentService.initiatePayment(staff, parkingSession._id, EXIT_EVIDENCE);
  await paymentService.settleSessionPayment(730001);

  expect((await ParkingSlot.findById(slot._id)).status).toBe('occupied');
});
