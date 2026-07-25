jest.mock('../../../src/services/payment/payos.service', () => ({
  generateOrderCode: jest.fn(() => 700001),
  createPaymentLink: jest.fn(),
  getPaymentLink: jest.fn(),
}));

const db = require('../../helpers/db');
const Payment = require('../../../src/models/finance/Payment');
const payosService = require('../../../src/services/payment/payos.service');
const { createPayosIntent } = require('../../../src/services/payment/paymentIntent.service');

beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.clear();
  jest.clearAllMocks();
  payosService.generateOrderCode.mockReturnValue(700001);
});

const input = () => ({
  paymentData: {
    type: 'topup',
    amount: 50000,
    note: 'test intent',
  },
  linkData: {
    amount: 50000,
    description: 'Test PBMS',
  },
});

test('explicit PayOS 4xx marks the DB-first intent failed', async () => {
  const error = new Error('invalid request');
  error.statusCode = 400;
  payosService.createPaymentLink.mockRejectedValue(error);
  payosService.getPaymentLink.mockRejectedValue(new Error('not found'));

  await expect(createPayosIntent(input())).rejects.toMatchObject({
    statusCode: 502,
    errorCode: 'PAYOS_CREATE_FAILED',
  });

  expect((await Payment.findOne({ payosOrderCode: 700001 })).status).toBe('failed');
});

test('ambiguous timeout reconciles the link by orderCode', async () => {
  payosService.createPaymentLink.mockRejectedValue(new Error('socket timeout'));
  payosService.getPaymentLink.mockResolvedValue({
    checkoutUrl: 'https://pay/recovered',
    qrCode: 'QR-RECOVERED',
    paymentLinkId: 'link-recovered',
  });

  const result = await createPayosIntent(input());

  expect(result.checkoutUrl).toBe('https://pay/recovered');
  expect(result.orderCode).toBe(700001);
  expect((await Payment.findOne({ payosOrderCode: 700001 })).status).toBe('pending');
});

test('DB create failure prevents any PayOS call', async () => {
  const createSpy = jest.spyOn(Payment, 'create').mockRejectedValueOnce(new Error('db unavailable'));

  await expect(createPayosIntent(input())).rejects.toThrow('db unavailable');
  expect(payosService.createPaymentLink).not.toHaveBeenCalled();

  createSpy.mockRestore();
});
