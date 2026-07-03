/** user/wallet.service — settle/verify top-up (idempotent) + list giao dịch. */
jest.mock('../../../src/services/payment/payos.service', () => ({
  generateOrderCode: jest.fn(() => 123456789),
  createPaymentLink: jest.fn(),
  getPaymentLink: jest.fn(),
}));

const db = require('../../helpers/db');
const f = require('../../helpers/fixtures');
const walletService = require('../../../src/services/user/wallet.service');
const payos = require('../../../src/services/payment/payos.service');
const User = require('../../../src/models/user/User');
const Payment = require('../../../src/models/finance/Payment');
const WalletTransaction = require('../../../src/models/finance/WalletTransaction');

let user;
const ORDER = 555001;
const pendingTopup = (amount = 50000) =>
  Payment.create({ type: 'topup', method: 'payos', amount, status: 'pending', user: user._id, payosOrderCode: ORDER });

beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => { await db.clear(); jest.clearAllMocks(); user = await f.createUser({ walletBalance: 10000 }); });

describe('settleTopup (idempotent)', () => {
  test('lần đầu → cộng ví + tạo WalletTransaction; lần 2 → no-op', async () => {
    await pendingTopup(50000);
    const r1 = await walletService.settleTopup(ORDER);
    expect(r1.credited).toBe(true);
    expect(r1.balance).toBe(60000); // 10000 + 50000

    const fresh = await User.findById(user._id);
    expect(fresh.walletBalance).toBe(60000);
    expect(await WalletTransaction.countDocuments({ user: user._id, reason: 'payos_topup' })).toBe(1);

    const r2 = await walletService.settleTopup(ORDER);
    expect(r2.credited).toBe(false);
    expect(await WalletTransaction.countDocuments({ user: user._id, reason: 'payos_topup' })).toBe(1);
  });
});

describe('verifyTopup', () => {
  test('PayOS báo PAID → settle + credited', async () => {
    await pendingTopup(20000);
    payos.getPaymentLink.mockResolvedValue({ status: 'PAID' });
    const r = await walletService.verifyTopup(user._id, ORDER);
    expect(r.status).toBe('success');
    expect(r.balance).toBe(30000);
  });

  test('PayOS chưa PAID → không cộng tiền', async () => {
    await pendingTopup(20000);
    payos.getPaymentLink.mockResolvedValue({ status: 'PENDING' });
    const r = await walletService.verifyTopup(user._id, ORDER);
    expect(r.credited).toBe(false);
    expect(r.balance).toBe(10000);
  });

  test('order không tồn tại → 404', async () => {
    await expect(walletService.verifyTopup(user._id, 999999)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('topup (validate)', () => {
  test('số tiền dưới mức tối thiểu → 400', async () => {
    await expect(walletService.topup(user._id, 1000)).rejects.toMatchObject({ statusCode: 400 });
  });
  test('số tiền không nguyên → 400', async () => {
    await expect(walletService.topup(user._id, 5000.5)).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('listTransactions', () => {
  test('phân trang + lọc theo type', async () => {
    await WalletTransaction.create([
      { user: user._id, type: 'credit', amount: 100, balanceAfter: 100, reason: 'payos_topup' },
      { user: user._id, type: 'debit', amount: 50, balanceAfter: 50, reason: 'reservation_deposit' },
    ]);
    const all = await walletService.listTransactions(user._id, {});
    expect(all.pagination.total).toBe(2);
    const debits = await walletService.listTransactions(user._id, { type: 'debit' });
    expect(debits.pagination.total).toBe(1);
  });
});
