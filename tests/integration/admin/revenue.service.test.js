/** admin/revenue.service — báo cáo doanh thu tổng hợp từ Payment. */
const db = require('../../helpers/db');
const f = require('../../helpers/fixtures');
const svc = require('../../../src/services/admin/revenue.service');
const Payment = require('../../../src/models/finance/Payment');
const mongoose = require('mongoose');

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
  test('loại cancellation_fee khỏi doanh thu — khoản gốc đã được ghi nhận, tránh đếm trùng', async () => {
    await Payment.create([
      { building: building._id, type: 'subscription', method: 'wallet', amount: 100000, status: 'success' },
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

  test('separates gross, refunds, net, pending cash and wallet funding', async () => {
    await Payment.create([
      { building: building._id, type: 'session', method: 'wallet', amount: 100000, status: 'success' },
      { building: building._id, type: 'penalty', method: 'cash', amount: 25000, status: 'success' },
      { building: building._id, type: 'refund', method: 'wallet', amount: 30000, status: 'success' },
      { building: building._id, type: 'session', method: 'cash', amount: 40000, status: 'pending' },
      { building: building._id, type: 'topup', method: 'payos', amount: 500000, status: 'success' },
    ]);

    const report = await svc.getReport({ from, to, buildingId: building._id });

    expect(report.summary).toMatchObject({
      grossRevenue: 125000,
      refunds: 30000,
      netRevenue: 95000,
      pendingCash: 40000,
      walletFunding: 500000,
      successfulPayments: 2,
      pendingCashPayments: 1,
    });
    expect(report.items[0].bySource).toMatchObject({
      parking: 100000,
      penalty: 25000,
    });
  });

  test('source totals partition gross revenue without counting incident metadata twice', async () => {
    const incidentId = new mongoose.Types.ObjectId();
    await Payment.create([
      {
        building: building._id,
        type: 'session',
        method: 'wallet',
        amount: 100000,
        status: 'success',
        incident: incidentId,
      },
      {
        building: building._id,
        type: 'subscription',
        method: 'wallet',
        amount: 300000,
        status: 'success',
      },
      {
        building: building._id,
        type: 'penalty',
        method: 'cash',
        amount: 25000,
        status: 'success',
        incident: incidentId,
      },
    ]);

    const report = await svc.getReport({ from, to, buildingId: building._id });
    const sources = report.items[0].bySource;

    expect(sources).toEqual({
      parking: 100000,
      subscription: 300000,
      penalty: 25000,
      other: 0,
    });
    expect(Object.values(sources).reduce((sum, amount) => sum + amount, 0))
      .toBe(report.summary.grossRevenue);
  });

  test('a pending payment receives settledAt when it is confirmed', async () => {
    const payment = await Payment.create({
      building: building._id,
      type: 'session',
      method: 'cash',
      amount: 20000,
      status: 'pending',
    });
    expect(payment.settledAt).toBeNull();

    const settled = await Payment.findOneAndUpdate(
      { _id: payment._id, status: 'pending' },
      { $set: { status: 'success' } },
      { new: true },
    );
    expect(settled.settledAt).toBeInstanceOf(Date);
  });
});

describe('listPayments', () => {
  test.each([
    [{ buildingId: 'not-an-object-id' }, 'buildingId'],
    [{ type: { $ne: 'session' } }, 'type'],
    [{ method: 'crypto' }, 'method'],
    [{ status: 'approved' }, 'status'],
    [{ from: 'not-a-date' }, 'from'],
    [{ to: ['2026-01-01'] }, 'to'],
  ])('rejects an unsafe or invalid filter: %p', async (query, field) => {
    await expect(svc.listPayments(query)).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining(field),
    });
  });

  test('accepts only normalized allowlisted filters', async () => {
    await Payment.create({
      building: building._id,
      type: 'session',
      method: 'cash',
      amount: 20000,
      status: 'success',
    });

    const result = await svc.listPayments({
      buildingId: String(building._id),
      type: 'session',
      method: 'cash',
      status: 'success',
      from,
      to,
    });

    expect(result.items).toHaveLength(1);
    expect(result.pagination.total).toBe(1);
  });
});
