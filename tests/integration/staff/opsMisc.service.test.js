/** staff: incident (thường + mất vé), wallet debit, submit shift report. */
const db = require('../../helpers/db');
const f = require('../../helpers/fixtures');
const incidentSvc = require('../../../src/services/staff/incident.service');
const walletSvc = require('../../../src/services/staff/wallet.service');
const shiftSvc = require('../../../src/services/staff/shift.service');
const ParkingSession = require('../../../src/models/operations/ParkingSession');
const ParkingSlot = require('../../../src/models/building/ParkingSlot');
const User = require('../../../src/models/user/User');
const Payment = require('../../../src/models/finance/Payment');

let building, staff;
beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.clear();
  building = await f.createBuilding();
  staff = await f.createUser({ role: 'staff' });
  staff.assignedBuildings = [building._id];
});

describe('incident.service', () => {
  test('tạo sự cố thường', async () => {
    const res = await incidentSvc.createIncident(staff, { type: 'damage', buildingId: building._id, note: 'trầy xe' });
    expect(res.item.type).toBe('damage');
    expect(res.item.status).toBe('open');
  });

  test('thiếu type → 400', async () => {
    await expect(incidentSvc.createIncident(staff, { buildingId: building._id }))
      .rejects.toMatchObject({ errorCode: 'INCIDENT_TYPE_REQUIRED' });
  });

  test('mất vé: force-checkout phiên + tạo payment + incident resolved', async () => {
    const floor = await f.createFloor(building._id);
    const slot = await f.createSlot(building._id, floor._id, { status: 'occupied' });
    const session = await ParkingSession.create({
      plateNumber: '51F-123.45', building: building._id, slot: slot._id, status: 'active', staff: staff._id,
    });
    const res = await incidentSvc.createIncident(staff, {
      type: 'lost_ticket', parkingSessionId: session._id, penaltyFee: 50000, buildingId: building._id,
    });
    expect(res.item.status).toBe('resolved');
    const freshSession = await ParkingSession.findById(session._id);
    expect(freshSession.status).toBe('completed');
    expect(freshSession.fee).toBe(50000);
    const freshSlot = await ParkingSlot.findById(slot._id);
    expect(freshSlot.status).toBe('available');
    expect(await Payment.countDocuments({ parkingSession: session._id })).toBe(1);
  });
});

describe('wallet.service', () => {
  test('trừ ví khách đủ số dư', async () => {
    const customer = await f.createUser({ walletBalance: 100000 });
    const res = await walletSvc.processWalletTransaction(staff, { userId: customer._id, amount: 30000, buildingId: building._id });
    expect(res.walletTransaction.amount).toBe(30000);
    const fresh = await User.findById(customer._id);
    expect(fresh.walletBalance).toBe(70000);
  });

  test('số dư không đủ → 409 INSUFFICIENT_WALLET_BALANCE', async () => {
    const customer = await f.createUser({ walletBalance: 1000 });
    await expect(walletSvc.processWalletTransaction(staff, { userId: customer._id, amount: 30000 }))
      .rejects.toMatchObject({ errorCode: 'INSUFFICIENT_WALLET_BALANCE' });
  });
});

describe('shift.service (staff)', () => {
  test('submitShiftReport tổng hợp doanh thu ca hôm nay', async () => {
    const shift = await f.createShift(building._id);
    const ss = await f.createStaffShift(building._id, staff._id, shift._id, { status: 'active' });
    await Payment.create([
      { building: building._id, staff: staff._id, type: 'session', method: 'cash', amount: 20000, status: 'success' },
      { building: building._id, staff: staff._id, type: 'session', method: 'wallet', amount: 30000, status: 'success' },
    ]);
    const res = await shiftSvc.submitShiftReport(staff, ss._id);
    expect(res.revenueReport.total).toBe(50000);
    expect(res.revenueReport.byMethod.cash).toBe(20000);
    expect(res.revenueReport.byMethod.wallet).toBe(30000);
    expect(res.revenueReport.count).toBe(2);
  });
});
