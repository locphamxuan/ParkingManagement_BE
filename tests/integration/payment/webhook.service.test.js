/**
 * webhook.service.handle — dispatcher xử lý webhook PayOS sau khi verify chữ ký.
 * Đây là entrypoint DUY NHẤT PayOS gọi để xác nhận thanh toán thật (top-up ví
 * user, top-up ví toà, thanh toán phiên gửi xe) — nếu dispatch sai loại/điều
 * kiện thì tiền thật không được cộng dù các hàm settle* riêng lẻ vẫn đúng.
 * Mock duy nhất payos.service.verifyWebhook (biên ngoài, gọi SDK thật);
 * mọi effect còn lại verify qua DB thật (MongoMemoryReplSet).
 */
jest.mock('../../../src/services/payment/payos.service', () => ({
  verifyWebhook: jest.fn(),
  generateOrderCode: jest.fn(),
  createPaymentLink: jest.fn(),
  getPaymentLink: jest.fn(),
}));

const { connect, clear, close } = require('../../helpers/db');
const fixtures = require('../../helpers/fixtures');

const payosService = require('../../../src/services/payment/payos.service');
const webhookService = require('../../../src/services/payment/webhook.service');
const Payment = require('../../../src/models/finance/Payment');
const User = require('../../../src/models/user/User');
const BuildingWallet = require('../../../src/models/finance/BuildingWallet');
const { ParkingSession } = require('../../../src/models');
const AppError = require('../../../src/utils/AppError');

jest.setTimeout(120000);

beforeAll(connect);
afterAll(close);
afterEach(() => {
  jest.clearAllMocks();
  return clear();
});

const mockWebhook = (data) => payosService.verifyWebhook.mockResolvedValue(data);

describe('webhook.service.handle', () => {
  test('chữ ký không hợp lệ → AppError 400, không đụng DB', async () => {
    payosService.verifyWebhook.mockRejectedValue(new Error('bad signature'));

    await expect(webhookService.handle({})).rejects.toThrow(AppError);
    await expect(webhookService.handle({})).rejects.toMatchObject({ statusCode: 400 });
  });

  test("code khác '00' (thất bại/huỷ) → bỏ qua, không đổi Payment", async () => {
    const user = await fixtures.createUser({ walletBalance: 0 });
    const payment = await Payment.create({
      type: 'topup', method: 'payos', amount: 50000, status: 'pending',
      user: user._id, payosOrderCode: 999001,
    });
    mockWebhook({ code: '01', orderCode: 999001 });

    await webhookService.handle({});

    expect((await Payment.findById(payment._id)).status).toBe('pending');
    expect((await User.findById(user._id)).walletBalance).toBe(0);
  });

  test('orderCode không tồn tại/đã xử lý → no-op (idempotent), không throw', async () => {
    mockWebhook({ code: '00', orderCode: 424242 });
    await expect(webhookService.handle({})).resolves.toBeUndefined();
  });

  test("type='topup' KHÔNG có building → cộng ví USER", async () => {
    const user = await fixtures.createUser({ walletBalance: 10000 });
    await Payment.create({
      type: 'topup', method: 'payos', amount: 50000, status: 'pending',
      user: user._id, payosOrderCode: 999002,
    });
    mockWebhook({ code: '00', orderCode: 999002 });

    await webhookService.handle({});

    expect((await User.findById(user._id)).walletBalance).toBe(60000);
    expect((await Payment.findOne({ payosOrderCode: 999002 })).status).toBe('success');
  });

  test("type='topup' CÓ building → cộng ví TOÀ NHÀ, không đụng ví user", async () => {
    const building = await fixtures.createBuilding();
    const manager = await fixtures.createUser({ role: 'manager', walletBalance: 0 });
    await Payment.create({
      type: 'topup', method: 'payos', amount: 80000, status: 'pending',
      user: manager._id, building: building._id, payosOrderCode: 999003,
    });
    mockWebhook({ code: '00', orderCode: 999003 });

    await webhookService.handle({});

    const wallet = await BuildingWallet.findOne({ building: building._id });
    expect(wallet.balance).toBe(80000);
    expect((await User.findById(manager._id)).walletBalance).toBe(0);
    expect((await Payment.findOne({ payosOrderCode: 999003 })).status).toBe('success');
  });

  test("type='session' → hoàn tất phiên gửi xe (checkout qua QR/online)", async () => {
    const building = await fixtures.createBuilding({ pricing: { hourlyRate: 15000 } });
    const vt = await fixtures.createVehicleType(building._id);
    await fixtures.createPricePolicy(building._id, vt._id, { hourlyRate: 15000 });
    const session = await ParkingSession.create({
      building: building._id, plateNumber: '51F-999.99', vehicleType: vt._id, status: 'active',
      entryTime: new Date(Date.now() - 2 * 3600 * 1000),
    });
    await Payment.create({
      type: 'session', method: 'payos', amount: 30000, status: 'pending',
      parkingSession: session._id, payosOrderCode: 999004,
    });
    mockWebhook({ code: '00', orderCode: 999004 });

    await webhookService.handle({});

    const ps = await ParkingSession.findById(session._id);
    expect(ps.status).toBe('completed');
    expect(ps.paymentMethod).toBe('payos');
    expect((await Payment.findOne({ payosOrderCode: 999004 })).status).toBe('success');
  });

  test('gọi lại webhook cho cùng orderCode đã success → idempotent, không cộng ví lần 2', async () => {
    const user = await fixtures.createUser({ walletBalance: 0 });
    await Payment.create({
      type: 'topup', method: 'payos', amount: 50000, status: 'pending',
      user: user._id, payosOrderCode: 999005,
    });
    mockWebhook({ code: '00', orderCode: 999005 });

    await webhookService.handle({});
    await webhookService.handle({}); // webhook PayOS có thể gửi trùng

    expect((await User.findById(user._id)).walletBalance).toBe(50000);
  });
});
