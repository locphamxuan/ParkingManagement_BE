/** admin/revenue.service — báo cáo doanh thu tổng hợp từ Payment. */
const db = require('../../helpers/db');
const f = require('../../helpers/fixtures');
const svc = require('../../../src/services/admin/revenue.service');
const Payment = require('../../../src/models/finance/Payment');

let building;

beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.clear();
  building = await f.createBuilding();
});

// Nới ±1 ngày để không flaky quanh nửa đêm (toISOString là UTC, server chạy giờ VN).
const from = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
const to = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);

describe('getReport', () => {
  test('loại cancellation_fee khỏi doanh thu — cọc gốc đã tính qua type reservation, tránh đếm trùng', async () => {
    await Payment.create([
      { building: building._id, type: 'reservation', method: 'wallet', amount: 100000, status: 'success' },
      { building: building._id, type: 'cancellation_fee', method: 'wallet', amount: 15000, status: 'success' },
    ]);

    const report = await svc.getReport({ from, to, buildingId: building._id });
    expect(report.grandTotal).toBe(100000);
  });

  test('loại refund/topup khỏi doanh thu', async () => {
    await Payment.create([
      { building: building._id, type: 'session', method: 'cash', amount: 50000, status: 'success' },
      { building: building._id, type: 'refund', method: 'wallet', amount: 20000, status: 'success' },
      { building: building._id, type: 'topup', method: 'wallet', amount: 30000, status: 'success' },
    ]);

    const report = await svc.getReport({ from, to, buildingId: building._id });
    expect(report.grandTotal).toBe(50000);
  });
});
