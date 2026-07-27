/**
 * manager/buildingWalletTopup.service — nạp tiền ví TOÀ NHÀ qua PayOS. Đường tiền
 * riêng, khác code path với ví user (user/wallet.service) — trước đợt audit này
 * chưa có test nào (chỉ được phủ gián tiếp qua webhook.service.test.js).
 */
jest.mock('../../../src/services/payment/payos.service', () => ({
  generateOrderCode: jest.fn(() => 555001),
  createPaymentLink: jest.fn(async () => ({ checkoutUrl: 'http://pay', qrCode: 'QR', paymentLinkId: 'plink' })),
  getPaymentLink: jest.fn(async () => ({ status: 'PAID' })),
}));

const db = require('../../helpers/db');
const f = require('../../helpers/fixtures');
const payosService = require('../../../src/services/payment/payos.service');
const topupSvc = require('../../../src/services/manager/buildingWalletTopup.service');
const Payment = require('../../../src/models/finance/Payment');
const BuildingWallet = require('../../../src/models/finance/BuildingWallet');

let building, manager;

beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.clear();
  f.resetSeq();
  jest.clearAllMocks();
  payosService.generateOrderCode.mockReturnValue(555001);
  payosService.createPaymentLink.mockResolvedValue({ checkoutUrl: 'http://pay', qrCode: 'QR', paymentLinkId: 'plink' });
  payosService.getPaymentLink.mockResolvedValue({ status: 'PAID' });
  building = await f.createBuilding();
  manager = await f.managerFor(building._id);
});

describe('buildingWalletTopup.service.topup', () => {
  test('amount <= 0 → 400', async () => {
    await expect(topupSvc.topup(building._id, manager._id, 0)).rejects.toMatchObject({ statusCode: 400 });
  });

  test('amount không phải số nguyên → 400', async () => {
    await expect(topupSvc.topup(building._id, manager._id, 1000.5)).rejects.toMatchObject({ statusCode: 400 });
  });

  test('amount dưới mức tối thiểu (2,000) → 400', async () => {
    await expect(topupSvc.topup(building._id, manager._id, 1000)).rejects.toMatchObject({ statusCode: 400 });
  });

  test('tạo Payment pending gắn đúng building (khác ví user — không có building)', async () => {
    const r = await topupSvc.topup(building._id, manager._id, 100000);
    expect(r.orderCode).toBe(555001);
    expect(r.checkoutUrl).toBe('http://pay');

    const payment = await Payment.findOne({ payosOrderCode: 555001 });
    expect(payment.status).toBe('pending');
    expect(String(payment.building)).toBe(String(building._id));
    expect(String(payment.user)).toBe(String(manager._id));
  });
});

describe('buildingWalletTopup.service.settleTopup / verifyTopup', () => {
  test('settleTopup cộng đúng ví building + idempotent lần gọi thứ 2', async () => {
    await topupSvc.topup(building._id, manager._id, 70000);

    const r1 = await topupSvc.settleTopup(555001);
    expect(r1).toMatchObject({ credited: true, status: 'success', balance: 70000, amount: 70000 });

    const wallet = await BuildingWallet.findOne({ building: building._id });
    expect(wallet.balance).toBe(70000);
    expect(wallet.totalReceived).toBe(70000);

    const r2 = await topupSvc.settleTopup(555001);
    expect(r2.credited).toBe(false);
    expect((await BuildingWallet.findOne({ building: building._id })).balance).toBe(70000);
  });

  test('verifyTopup: PayOS báo PAID → settle; gọi lại không cộng lần 2', async () => {
    await topupSvc.topup(building._id, manager._id, 50000);

    const v1 = await topupSvc.verifyTopup(building._id, 555001);
    expect(v1).toMatchObject({ status: 'success', credited: true });

    const v2 = await topupSvc.verifyTopup(building._id, 555001);
    expect(v2).toMatchObject({ status: 'success', credited: false });

    expect((await BuildingWallet.findOne({ building: building._id })).balance).toBe(50000);
  });

  test('verifyTopup: orderCode không tồn tại → 404', async () => {
    await expect(topupSvc.verifyTopup(building._id, 999999)).rejects.toMatchObject({ statusCode: 404 });
  });

  test('verifyTopup: PayOS báo chưa PAID → không settle, trả trạng thái pending', async () => {
    await topupSvc.topup(building._id, manager._id, 40000);
    payosService.getPaymentLink.mockResolvedValueOnce({ status: 'PENDING' });

    const r = await topupSvc.verifyTopup(building._id, 555001);
    expect(r).toMatchObject({ status: 'pending', credited: false });
    expect((await BuildingWallet.findOne({ building: building._id }))?.balance || 0).toBe(0);
  });
});
