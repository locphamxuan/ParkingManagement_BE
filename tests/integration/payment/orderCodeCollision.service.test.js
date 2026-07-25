/**
 * P1-C — `payosOrderCode` phải là duy nhất. Test dựng lại đúng trạng thái SAU khi
 * migration đã tạo partial unique index (index chỉ được tạo bởi
 * businessLogicAudit.cli --apply-indexes, không khai báo trong schema), rồi kiểm
 * chứng: DB thật sự chặn trùng, và tầng service retry đúng khi đụng trùng.
 */
jest.mock('../../../src/services/payment/payos.service', () => ({
  generateOrderCode: jest.fn(),
  createPaymentLink: jest.fn(),
  getPaymentLink: jest.fn(),
  verifyWebhook: jest.fn(),
}));

const db = require('../../helpers/db');
const f = require('../../helpers/fixtures');
const payosService = require('../../../src/services/payment/payos.service');
const { createPayosIntent } = require('../../../src/services/payment/paymentIntent.service');
const Payment = require('../../../src/models/finance/Payment');

jest.setTimeout(180000);

const EXISTING_CODE = 700_001;
const FREE_CODE = 700_002;

let user;

beforeAll(async () => {
  await db.connect();
  // Giống hệt index mà migration tạo trên môi trường thật.
  await Payment.collection.createIndex(
    { payosOrderCode: 1 },
    {
      unique: true,
      name: 'uniq_payos_order_code',
      partialFilterExpression: { payosOrderCode: { $type: 'number' } },
    },
  );
});
afterAll(async () => { await db.close(); });

beforeEach(async () => {
  await db.clear();
  jest.clearAllMocks();
  f.resetSeq();
  user = await f.createUser();
  payosService.createPaymentLink.mockResolvedValue({
    checkoutUrl: 'https://pay.test/checkout',
    qrCode: 'QR',
    paymentLinkId: 'link-1',
  });
});

const intentInput = () => ({
  paymentData: { type: 'topup', amount: 50_000, user: user._id, note: 'test' },
  linkData: { amount: 50_000, description: 'test' },
});

test('DB chặn hai Payment cùng payosOrderCode (index unique thật sự có hiệu lực)', async () => {
  await Payment.create({
    type: 'topup', method: 'payos', amount: 1000, status: 'pending',
    user: user._id, payosOrderCode: EXISTING_CODE,
  });

  await expect(Payment.create({
    type: 'topup', method: 'payos', amount: 1000, status: 'pending',
    user: user._id, payosOrderCode: EXISTING_CODE,
  })).rejects.toMatchObject({ code: 11000 });
});

test('nhiều Payment cùng payosOrderCode = null vẫn hợp lệ (partial index)', async () => {
  await Payment.create({ type: 'session', method: 'cash', amount: 1000, status: 'success', user: user._id });
  await Payment.create({ type: 'session', method: 'cash', amount: 2000, status: 'success', user: user._id });

  expect(await Payment.countDocuments({ payosOrderCode: null })).toBe(2);
});

test('đụng orderCode đã tồn tại → retry và tạo intent bằng mã mới', async () => {
  await Payment.create({
    type: 'topup', method: 'payos', amount: 1000, status: 'pending',
    user: user._id, payosOrderCode: EXISTING_CODE,
  });
  payosService.generateOrderCode
    .mockReturnValueOnce(EXISTING_CODE)
    .mockReturnValueOnce(FREE_CODE);

  const intent = await createPayosIntent(intentInput());

  expect(payosService.generateOrderCode).toHaveBeenCalledTimes(2);
  expect(intent.orderCode).toBe(FREE_CODE);
  // PayOS chỉ được gọi SAU khi intent đã nằm trong DB, và chỉ với mã cuối cùng.
  expect(payosService.createPaymentLink).toHaveBeenCalledTimes(1);
  expect(payosService.createPaymentLink).toHaveBeenCalledWith(
    expect.objectContaining({ orderCode: FREE_CODE }),
  );
  expect(await Payment.countDocuments({ payosOrderCode: FREE_CODE })).toBe(1);
  expect(await Payment.countDocuments({})).toBe(2);
});

test('luôn đụng trùng → dừng sau số lần thử giới hạn với PAYOS_ORDER_CODE_EXHAUSTED', async () => {
  await Payment.create({
    type: 'topup', method: 'payos', amount: 1000, status: 'pending',
    user: user._id, payosOrderCode: EXISTING_CODE,
  });
  payosService.generateOrderCode.mockReturnValue(EXISTING_CODE);

  await expect(createPayosIntent(intentInput())).rejects.toMatchObject({
    statusCode: 503,
    errorCode: 'PAYOS_ORDER_CODE_EXHAUSTED',
  });

  // Không gọi PayOS và không tạo thêm Payment nào khi chưa cấp phát được mã.
  expect(payosService.createPaymentLink).not.toHaveBeenCalled();
  expect(await Payment.countDocuments({})).toBe(1);
});
