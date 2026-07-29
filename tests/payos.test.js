// Mock PayOS SDK để không gọi API thật.
jest.mock('../src/services/payment/payos.service', () => ({
  generateOrderCode: jest.fn(() => 12345),
  createPaymentLink: jest.fn(async () => ({ checkoutUrl: 'http://pay', qrCode: 'QR', paymentLinkId: 'plink' })),
  getPaymentLink: jest.fn(async () => ({ status: 'PAID' })),
}));

const mongoose = require('mongoose');
const { connect, clearAll, stop } = require('./db');

const Building = require('../src/models/building/Building');
const VehicleType = require('../src/models/building/VehicleType');
const PricePolicy = require('../src/models/policy/PricePolicy');
const Payment = require('../src/models/finance/Payment');
const { ParkingSession } = require('../src/models');
const Shift = require('../src/models/operations/Shift');
const StaffShift = require('../src/models/operations/StaffShift');

const svc = require('../src/services/staff/parkingSession.service');

jest.setTimeout(120000);
const HOUR = 3600 * 1000;
const RATE = 15000;
const EXIT_EVIDENCE = {
  exitPlateImage: 'exit-plate',
  exitPortraitImage: 'exit-portrait',
};

const seed = async () => {
  const building = await Building.create({ name: 'B', code: 'B1', totalFloors: 1, pricing: { hourlyRate: RATE } });
  const vt = await VehicleType.create({ building: building._id, code: 'CAR', name: 'Ô tô' });
  await PricePolicy.create({ building: building._id, vehicleType: vt._id, name: 'Reg', type: 'regular', hourlyRate: RATE });
  const staff = { _id: new mongoose.Types.ObjectId(), assignedBuildings: [building._id] };
  const shift = await Shift.create({
    building: building._id,
    name: 'All day',
    code: 'ALL_DAY',
    startTime: '00:00',
    endTime: '23:59',
    isActive: true,
  });
  await StaffShift.create({
    building: building._id,
    staff: staff._id,
    shift: shift._id,
    workDate: new Date(),
    status: 'active',
  });
  const session = await ParkingSession.create({
    building: building._id, plateNumber: '59G2-820.00', vehicleType: vt._id, status: 'active',
    entryTime: new Date(Date.now() - 2 * HOUR),
  });
  return { building, vt, staff, session };
};

beforeAll(connect);
afterAll(stop);
afterEach(clearAll);

describe('PayOS — initiate / settle / verify', () => {
  test('initiatePayment from API without exit evidence is rejected', async () => {
    const { staff, session } = await seed();

    await expect(svc.initiatePayment(staff, session._id)).rejects.toMatchObject({
      statusCode: 400,
      errorCode: 'EVIDENCE_REQUIRED',
    });
    expect(await Payment.countDocuments()).toBe(0);
  });

  test('initiatePayment tạo Payment pending + trả checkoutUrl/orderCode', async () => {
    const { staff, session } = await seed();
    const r = await svc.initiatePayment(staff, session._id, EXIT_EVIDENCE);
    expect(r.orderCode).toBe(12345);
    expect(r.checkoutUrl).toBe('http://pay');
    expect(r.amount).toBeGreaterThanOrEqual(2 * RATE);

    const p = await Payment.findOne({ payosOrderCode: 12345 });
    expect(p.status).toBe('pending');
    expect(p.method).toBe('payos');
    expect(p.checkoutDraft.verifiedAt).toBeTruthy();
  });

  test('settleSessionPayment hoàn tất phiên + idempotent', async () => {
    const { staff, session } = await seed();
    await svc.initiatePayment(staff, session._id, EXIT_EVIDENCE);

    const r1 = await svc.settleSessionPayment(12345);
    expect(r1).toMatchObject({ settled: true, status: 'success' });

    const ps = await ParkingSession.findById(session._id);
    expect(ps.status).toBe('active');
    expect(ps.exitTime).toBeNull();
    expect((await Payment.findOne({ payosOrderCode: 12345 })).status).toBe('success');

    // gọi lại → không xử lý lần 2
    const r2 = await svc.settleSessionPayment(12345);
    expect(r2.settled).toBe(false);
  });

  test('verifySessionPayment: PAID → settle; đã success → không settle lại', async () => {
    const { staff, session } = await seed();
    await svc.initiatePayment(staff, session._id, EXIT_EVIDENCE);

    const v1 = await svc.verifySessionPayment(staff, 12345);
    expect(v1).toMatchObject({ status: 'success', settled: true });
    expect((await ParkingSession.findById(session._id)).status).toBe('active');
    await expect(svc.getSessionPaymentIntent(staff, session._id)).resolves.toMatchObject({
      status: 'success',
      orderCode: 12345,
    });
    await svc.checkOut(staff, session._id, { paymentMethod: 'payos' });
    const completed = await ParkingSession.findById(session._id);
    expect(completed.status).toBe('completed');
    expect(completed.exitPlateImage).toBe(EXIT_EVIDENCE.exitPlateImage);
    expect(completed.exitPortraitImage).toBe(EXIT_EVIDENCE.exitPortraitImage);

    const v2 = await svc.verifySessionPayment(staff, 12345);
    expect(v2).toMatchObject({ status: 'success', settled: false });
  });
});
