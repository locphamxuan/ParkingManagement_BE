/** staff: incident, wallet debit, submit shift report. */
const db = require('../../helpers/db');
const f = require('../../helpers/fixtures');
const incidentSvc = require('../../../src/services/staff/incident.service');
const walletSvc = require('../../../src/services/staff/wallet.service');
const User = require('../../../src/models/user/User');

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
