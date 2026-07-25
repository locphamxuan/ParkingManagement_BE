/**
 * stalePayosReport.service — báo cáo CHỈ ĐỌC các PayOS Payment kẹt 'pending'.
 * Test chứng minh: lọc đúng theo ngưỡng, details đủ để đối soát, và tuyệt đối
 * không ghi dữ liệu.
 */
const db = require('../../helpers/db');
const f = require('../../helpers/fixtures');
const Payment = require('../../../src/models/finance/Payment');
const { reportStalePayosPayments } = require('../../../src/services/shared/stalePayosReport.service');

jest.setTimeout(120000);

let user;
let building;

beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.clear();
  user = await f.createUser();
  building = await f.createBuilding();
});

const MINUTE = 60_000;
const now = new Date('2026-07-25T10:00:00Z');

const createPayment = (over = {}) => Payment.create({
  type: 'topup',
  method: 'payos',
  amount: 50_000,
  status: 'pending',
  user: user._id,
  payosOrderCode: 900_001,
  ...over,
});

// Mongoose đánh dấu `createdAt` immutable → $set qua model bị strip. Dùng native
// driver để lùi thời điểm tạo một cách tất định.
const backdate = (payment, minutes) => Payment.collection.updateOne(
  { _id: payment._id },
  { $set: { createdAt: new Date(now.getTime() - minutes * MINUTE) } },
);

test('không có pending quá hạn → total 0', async () => {
  const fresh = await createPayment();
  await backdate(fresh, 5);

  const report = await reportStalePayosPayments({ olderThanMinutes: 30, now });

  expect(report.total).toBe(0);
  expect(report.details).toEqual([]);
  expect(report.olderThanMinutes).toBe(30);
});

test('pending mới hơn ngưỡng không xuất hiện; pending quá hạn thì có đủ details', async () => {
  const fresh = await createPayment({ payosOrderCode: 900_002 });
  await backdate(fresh, 10);
  const stale = await createPayment({
    payosOrderCode: 900_003,
    type: 'session',
    building: building._id,
    amount: 25_000,
  });
  await backdate(stale, 90);

  const report = await reportStalePayosPayments({ olderThanMinutes: 30, now });

  expect(report.total).toBe(1);
  const [row] = report.details;
  expect(row.paymentId).toBe(`${stale._id}`);
  expect(row.payosOrderCode).toBe(900_003);
  expect(row.type).toBe('session');
  expect(row.amount).toBe(25_000);
  expect(row.ageMinutes).toBe(90);
  expect(row.createdAt).toBe(new Date(now.getTime() - 90 * MINUTE).toISOString());
  expect(row.reference).toMatchObject({
    buildingId: `${building._id}`,
    userId: `${user._id}`,
  });
});

test('chỉ lấy method payos + status pending — success/failed và method khác bị loại', async () => {
  const settled = await createPayment({ payosOrderCode: 900_004, status: 'success' });
  await backdate(settled, 120);
  const failed = await createPayment({ payosOrderCode: 900_005, status: 'failed' });
  await backdate(failed, 120);
  const cash = await createPayment({ payosOrderCode: null, method: 'cash' });
  await backdate(cash, 120);
  const stale = await createPayment({ payosOrderCode: 900_006 });
  await backdate(stale, 120);

  const report = await reportStalePayosPayments({ olderThanMinutes: 60, now });

  expect(report.total).toBe(1);
  expect(report.details[0].paymentId).toBe(`${stale._id}`);
});

test('report không ghi bất kỳ dữ liệu nào', async () => {
  const stale = await createPayment({ payosOrderCode: 900_007 });
  await backdate(stale, 200);
  const before = await Payment.findById(stale._id).lean();

  await reportStalePayosPayments({ olderThanMinutes: 30, now });

  const after = await Payment.findById(stale._id).lean();
  expect(after).toEqual(before);
  expect(await Payment.countDocuments({})).toBe(1);
});

test('ngưỡng không hợp lệ bị từ chối — không tự đoán SLA', async () => {
  await expect(reportStalePayosPayments({ olderThanMinutes: 0, now })).rejects.toThrow(/positive integer/);
  await expect(reportStalePayosPayments({ olderThanMinutes: -5, now })).rejects.toThrow(/positive integer/);
  await expect(reportStalePayosPayments({ olderThanMinutes: 1.5, now })).rejects.toThrow(/positive integer/);
  await expect(reportStalePayosPayments({ now })).rejects.toThrow(/positive integer/);
});
