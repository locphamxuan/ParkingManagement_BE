jest.mock('../../../src/services/payment/payos.service', () => ({
  generateOrderCode: jest.fn(),
  createPaymentLink: jest.fn(),
  getPaymentLink: jest.fn(async () => ({ status: 'PAID' })),
}));

const db = require('../../helpers/db');
const f = require('../../helpers/fixtures');
const Payment = require('../../../src/models/finance/Payment');
const topupService = require('../../../src/services/manager/buildingWalletTopup.service');

beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });
afterEach(async () => { await db.clear(); });

test('manager cannot verify a top-up belonging to another building', async () => {
  const buildingA = await f.createBuilding();
  const buildingB = await f.createBuilding();
  await Payment.create({
    building: buildingB._id,
    type: 'topup',
    method: 'payos',
    amount: 50000,
    status: 'pending',
    payosOrderCode: 810001,
  });

  await expect(topupService.verifyTopup(buildingA._id, 810001))
    .rejects.toMatchObject({ statusCode: 404 });
});
