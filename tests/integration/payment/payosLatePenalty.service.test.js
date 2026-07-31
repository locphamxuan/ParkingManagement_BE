/**
 * Phạt được manager duyệt SAU khi QR PayOS đã tạo (QR chỉ chứa phí gửi xe).
 * Khách đã quét trả tiền → phí gửi xe không thể thu lại, nhưng xe vẫn không được
 * ra khi còn khoản phạt chưa thu. Lối thoát DUY NHẤT: staff chỉ định
 * `penaltyPaymentMethod` (cash/wallet) để thu riêng phần phạt tại cổng.
 */
jest.mock('../../../src/services/payment/payos.service', () => ({
  generateOrderCode: jest.fn(() => 940001),
  createPaymentLink: jest.fn(async () => ({
    checkoutUrl: 'https://pay/late-penalty',
    qrCode: 'QR',
    paymentLinkId: 'late-penalty-link',
  })),
  getPaymentLink: jest.fn(async () => ({ status: 'PAID' })),
}));

const db = require('../../helpers/db');
const f = require('../../helpers/fixtures');
const paymentService = require('../../../src/services/staff/parkingSession/payment.service');
const { checkOut } = require('../../../src/services/staff/parkingSession/checkOut.service');
const staffIncidentSvc = require('../../../src/services/staff/incident.service');
const managerIncidentSvc = require('../../../src/services/manager/incident.service');
const payosService = require('../../../src/services/payment/payos.service');
const Payment = require('../../../src/models/finance/Payment');
const Incident = require('../../../src/models/log/Incident');
const ParkingSession = require('../../../src/models/operations/ParkingSession');
const ParkingSlot = require('../../../src/models/building/ParkingSlot');
const ViolationType = require('../../../src/models/policy/ViolationType');
const AuditLog = require('../../../src/models/log/AuditLog');

jest.setTimeout(120000);

const ORDER_CODE = 940001;
const PENALTY_FEE = 100000;
const PLATE = '51F-888.88';
const EXIT_EVIDENCE = { exitPlateImage: 'exit-plate', exitPortraitImage: 'exit-portrait' };

let building, staff, manager, slot, parkingSession;

beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });

beforeEach(async () => {
  await db.clear();
  f.resetSeq();
  jest.clearAllMocks();
  payosService.generateOrderCode.mockReturnValue(ORDER_CODE);

  building = await f.createBuilding();
  const vehicleType = await f.createVehicleType(building._id);
  await f.createPricePolicy(building._id, vehicleType._id, { hourlyRate: 15000 });
  const floor = await f.createFloor(building._id);
  slot = await f.createSlot(building._id, floor._id, { vehicleType: vehicleType._id, status: 'occupied' });

  staff = await f.createUser({ role: 'staff' });
  staff.assignedBuildings = [building._id];
  manager = await f.managerFor(building._id);
  const shift = await f.createShift(building._id, { startTime: '00:00', endTime: '23:59' });
  await f.createStaffShift(building._id, staff._id, shift._id);
  await ViolationType.create({
    building: building._id, code: 'slot_occupied', label: 'Occupying a reserved slot', fee: PENALTY_FEE,
  });

  parkingSession = await ParkingSession.create({
    building: building._id,
    plateNumber: PLATE,
    vehicleType: vehicleType._id,
    slot: slot._id,
    status: 'active',
    entryTime: new Date(Date.now() - 2 * 60 * 60 * 1000),
  });
});

/** Manager duyệt phạt cho biển đang đỗ → incident chuyển 'penalty_pending'. */
const approvePenalty = async () => {
  const incident = await staffIncidentSvc.createIncident(staff, {
    type: 'slot_occupied', buildingId: building._id,
  });
  await managerIncidentSvc.resolve(manager, building._id, incident.item._id, {
    action: 'penalize_violator', violatorPlate: PLATE,
  });
  return incident.item._id;
};

/** QR tạo lúc chưa có phạt → khách trả xong → phạt mới được duyệt. */
const payQrThenApprovePenalty = async () => {
  const intent = await paymentService.initiatePayment(staff, parkingSession._id, EXIT_EVIDENCE);
  const incidentId = await approvePenalty();
  await paymentService.settleSessionPayment(ORDER_CODE);
  return { incidentId, amount: intent.amount };
};

describe('phạt duyệt SAU khi tạo QR PayOS', () => {
  test('tạo QR khi ĐÃ có phạt vẫn bị chặn (giữ nguyên quy tắc cũ)', async () => {
    await approvePenalty();

    await expect(
      paymentService.initiatePayment(staff, parkingSession._id, EXIT_EVIDENCE),
    ).rejects.toMatchObject({
      statusCode: 409, errorCode: 'PENDING_PENALTY_REQUIRES_MANUAL_PAYMENT',
    });
  });

  test('payos + penaltyPaymentMethod=cash → phí gửi xe không thu lại, phạt thu riêng, phiên hoàn tất', async () => {
    const { incidentId, amount } = await payQrThenApprovePenalty();

    const done = await checkOut(staff, parkingSession._id, {
      paymentMethod: 'payos', penaltyPaymentMethod: 'cash',
    });

    // Phí gửi xe: đúng 1 Payment PayOS 'success', không phát sinh khoản thứ hai.
    const feePayments = await Payment.find({ parkingSession: parkingSession._id, type: 'session' });
    expect(feePayments).toHaveLength(1);
    expect(feePayments[0]).toMatchObject({ method: 'payos', status: 'success', amount });

    // Phí phạt: Payment RIÊNG, cash → pending chờ manager xác nhận thu.
    const penaltyPayments = await Payment.find({ parkingSession: parkingSession._id, type: 'penalty' });
    expect(penaltyPayments).toHaveLength(1);
    expect(penaltyPayments[0]).toMatchObject({ method: 'cash', status: 'pending', amount: PENALTY_FEE });
    expect(`${penaltyPayments[0].incident}`).toBe(`${incidentId}`);

    expect((await Incident.findById(incidentId)).status).toBe('resolved');
    expect(done.status).toBe('completed');
    expect(done.paymentMethod).toBe('payos');
    expect(done.exitPlateImage).toBe(EXIT_EVIDENCE.exitPlateImage);
    expect((await ParkingSlot.findById(slot._id)).status).toBe('available');

    const audit = await AuditLog.findOne({ action: 'PARKING_SESSION_CHECK_OUT', targetId: `${parkingSession._id}` });
    expect(audit?.metadata?.penaltyPaymentMethod).toBe('cash');
  });

  test('payos + penaltyPaymentMethod=wallet → trừ ví chủ xe, phạt success ngay', async () => {
    const owner = await f.createUser({ walletBalance: 500000 });
    await ParkingSession.updateOne({ _id: parkingSession._id }, { $set: { user: owner._id } });
    const { incidentId } = await payQrThenApprovePenalty();

    await checkOut(staff, parkingSession._id, {
      paymentMethod: 'payos', penaltyPaymentMethod: 'wallet',
    });

    const penalty = await Payment.findOne({ parkingSession: parkingSession._id, type: 'penalty' });
    expect(penalty).toMatchObject({ method: 'wallet', status: 'success', amount: PENALTY_FEE });
    expect((await Incident.findById(incidentId)).status).toBe('resolved');
    const User = require('../../../src/models/user/User');
    expect((await User.findById(owner._id)).walletBalance).toBe(500000 - PENALTY_FEE);
  });

  test('thiếu penaltyPaymentMethod → 400 PENALTY_PAYMENT_METHOD_REQUIRED, không commit gì', async () => {
    const { incidentId } = await payQrThenApprovePenalty();

    await expect(
      checkOut(staff, parkingSession._id, { paymentMethod: 'payos' }),
    ).rejects.toMatchObject({ statusCode: 400, errorCode: 'PENALTY_PAYMENT_METHOD_REQUIRED' });

    expect(await Payment.countDocuments({ parkingSession: parkingSession._id, type: 'penalty' })).toBe(0);
    expect((await Incident.findById(incidentId)).status).toBe('penalty_pending');
    expect((await ParkingSession.findById(parkingSession._id)).status).toBe('active');
    expect((await ParkingSlot.findById(slot._id)).status).toBe('occupied');
  });

  test.each(['payos', 'card', 'bogus'])(
    'penaltyPaymentMethod=%s (không phải cách staff thu được) → 400 INVALID_PENALTY_PAYMENT_METHOD',
    async (penaltyPaymentMethod) => {
      const { incidentId } = await payQrThenApprovePenalty();

      await expect(
        checkOut(staff, parkingSession._id, { paymentMethod: 'payos', penaltyPaymentMethod }),
      ).rejects.toMatchObject({ statusCode: 400, errorCode: 'INVALID_PENALTY_PAYMENT_METHOD' });

      expect(await Payment.countDocuments({ parkingSession: parkingSession._id, type: 'penalty' })).toBe(0);
      expect((await Incident.findById(incidentId)).status).toBe('penalty_pending');
      expect((await ParkingSession.findById(parkingSession._id)).status).toBe('active');
    },
  );

  test('không có phạt → checkout PayOS giữ nguyên hành vi cũ (không cần penaltyPaymentMethod)', async () => {
    await paymentService.initiatePayment(staff, parkingSession._id, EXIT_EVIDENCE);
    await paymentService.settleSessionPayment(ORDER_CODE);

    const done = await checkOut(staff, parkingSession._id, { paymentMethod: 'payos' });

    expect(done.status).toBe('completed');
    expect(await Payment.countDocuments({ parkingSession: parkingSession._id })).toBe(1);
    expect((await ParkingSlot.findById(slot._id)).status).toBe('available');
  });

  test('cash checkout khi phí gửi xe đã trả qua PayOS → vẫn chặn thu trùng', async () => {
    await payQrThenApprovePenalty();

    await expect(
      checkOut(staff, parkingSession._id, { paymentMethod: 'cash', penaltyPaymentMethod: 'cash' }),
    ).rejects.toMatchObject({ statusCode: 409, errorCode: 'PAYOS_PAYMENT_ALREADY_RECEIVED' });
  });
});
