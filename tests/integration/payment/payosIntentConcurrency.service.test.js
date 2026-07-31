/**
 * P0 — hai request tạo QR PayOS SONG SONG cho cùng 1 phiên gửi xe.
 *
 * Trước fix: cả hai đều thấy "chưa có intent pending" rồi mỗi bên tạo một Payment +
 * một link PayOS. Khách quét nhầm cả hai QR → ví toà nhà được cộng tiền 2 lần cho
 * cùng một lượt gửi xe. Unique partial index `uniq_live_payos_session_intent` + luồng
 * claim atomic bảo đảm chỉ có MỘT QR trả tiền được.
 */
jest.mock('../../../src/services/payment/payos.service', () => ({
  generateOrderCode: jest.fn(),
  createPaymentLink: jest.fn(async ({ orderCode }) => ({
    checkoutUrl: `https://pay/${orderCode}`,
    qrCode: `QR-${orderCode}`,
    paymentLinkId: `link-${orderCode}`,
  })),
  getPaymentLink: jest.fn(async () => ({ status: 'PENDING' })),
}));

const mongoose = require('mongoose');
const db = require('../../helpers/db');
const f = require('../../helpers/fixtures');
const Payment = require('../../../src/models/finance/Payment');
const ParkingSession = require('../../../src/models/operations/ParkingSession');
const paymentService = require('../../../src/services/staff/parkingSession/payment.service');
const payosService = require('../../../src/services/payment/payos.service');

jest.setTimeout(120000);

const EXIT_EVIDENCE = { exitPlateImage: 'exit-plate', exitPortraitImage: 'exit-portrait' };

let orderCodeSeed = 810000;

beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.clear();
  f.resetSeq();
  jest.clearAllMocks();
  // Mỗi lần gọi sinh 1 orderCode KHÁC nhau — nếu chốt chặn hỏng, hai QR khác nhau sẽ
  // cùng tồn tại (đúng kịch bản double-charge cần chặn).
  orderCodeSeed = 810000;
  payosService.generateOrderCode.mockImplementation(() => { orderCodeSeed += 1; return orderCodeSeed; });
  payosService.createPaymentLink.mockImplementation(async ({ orderCode }) => ({
    checkoutUrl: `https://pay/${orderCode}`,
    qrCode: `QR-${orderCode}`,
    paymentLinkId: `link-${orderCode}`,
  }));
  payosService.getPaymentLink.mockResolvedValue({ status: 'PENDING' });
});

const seedSession = async () => {
  const building = await f.createBuilding();
  const vehicleType = await f.createVehicleType(building._id, { category: 'car' });
  await f.createPricePolicy(building._id, vehicleType._id, { hourlyRate: 15000 });
  const staff = { _id: new mongoose.Types.ObjectId(), assignedBuildings: [building._id] };
  const shift = await f.createShift(building._id, { code: 'ALL_DAY', startTime: '00:00', endTime: '23:59' });
  await f.createStaffShift(building._id, staff._id, shift._id, { workDate: new Date() });
  const parkingSession = await ParkingSession.create({
    building: building._id,
    plateNumber: '51F-808.08',
    vehicleType: vehicleType._id,
    status: 'active',
    entryTime: new Date(Date.now() - 2 * 60 * 60 * 1000),
  });
  return { building, staff, parkingSession };
};

const livePayosIntents = (sessionId) => Payment.countDocuments({
  parkingSession: sessionId,
  type: 'session',
  method: 'payos',
  status: { $in: ['pending', 'success'] },
});

describe('concurrent PayOS QR creation', () => {
  test('two parallel initiations yield exactly one payable intent', async () => {
    const { staff, parkingSession } = await seedSession();

    const results = await Promise.allSettled([
      paymentService.initiatePayment(staff, parkingSession._id, EXIT_EVIDENCE),
      paymentService.initiatePayment(staff, parkingSession._id, EXIT_EVIDENCE),
    ]);

    expect(await livePayosIntents(parkingSession._id)).toBe(1);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    // Mọi request THÀNH CÔNG phải trỏ về CÙNG một orderCode — không bao giờ 2 QR trả được.
    const orderCodes = new Set(fulfilled.map((r) => r.value.orderCode));
    expect(orderCodes.size).toBe(1);
    // Request thua cuộc (nếu có) phải là lỗi nghiệp vụ rõ ràng, không phải lỗi Mongo thô.
    results
      .filter((r) => r.status === 'rejected')
      .forEach((r) => {
        expect(r.reason.statusCode).toBe(409);
        expect(['PAYOS_INTENT_IN_PROGRESS', 'PAYOS_PAYMENT_ALREADY_RECEIVED'])
          .toContain(r.reason.errorCode);
      });
  });

  test('five parallel initiations still yield exactly one payable intent', async () => {
    const { staff, parkingSession } = await seedSession();

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        paymentService.initiatePayment(staff, parkingSession._id, EXIT_EVIDENCE)),
    );

    expect(await livePayosIntents(parkingSession._id)).toBe(1);
    const settledCodes = new Set(
      results.filter((r) => r.status === 'fulfilled').map((r) => r.value.orderCode),
    );
    expect(settledCodes.size).toBe(1);
  });

  test('settlement stays idempotent and never completes the parking session', async () => {
    const { staff, parkingSession } = await seedSession();
    const intent = await paymentService.initiatePayment(staff, parkingSession._id, EXIT_EVIDENCE);

    const [first, second] = await Promise.all([
      paymentService.settleSessionPayment(intent.orderCode),
      paymentService.settleSessionPayment(intent.orderCode),
    ]);

    expect([first.settled, second.settled].filter(Boolean)).toHaveLength(1);
    expect(await Payment.countDocuments({
      parkingSession: parkingSession._id, type: 'session', status: 'success',
    })).toBe(1);
    // PayOS chỉ XÁC NHẬN tiền — xe vẫn phải do staff cho ra.
    expect((await ParkingSession.findById(parkingSession._id)).status).toBe('active');
  });

  test('a retired (expired) intent can be replaced by a new QR', async () => {
    const { staff, parkingSession } = await seedSession();
    const first = await paymentService.initiatePayment(staff, parkingSession._id, EXIT_EVIDENCE);

    payosService.getPaymentLink.mockResolvedValueOnce({ status: 'EXPIRED' });
    const replacement = await paymentService.initiatePayment(staff, parkingSession._id, EXIT_EVIDENCE);

    expect(replacement.orderCode).not.toBe(first.orderCode);
    expect((await Payment.findOne({ payosOrderCode: first.orderCode })).status).toBe('failed');
    expect(await livePayosIntents(parkingSession._id)).toBe(1);
  });
});
