const mongoose = require('mongoose');
const { connect, clearAll, stop } = require('./db');

const User = require('../src/models/user/User');
const Building = require('../src/models/building/Building');
const VehicleType = require('../src/models/building/VehicleType');
const Floor = require('../src/models/building/Floor');
const ParkingSlot = require('../src/models/building/ParkingSlot');
const LongTermPackage = require('../src/models/policy/LongTermPackage');
const LongTermSubscription = require('../src/models/policy/LongTermSubscription');
const WalletTransaction = require('../src/models/finance/WalletTransaction');

const longTerm = require('../src/services/user/longTerm.service');

jest.setTimeout(120000);

const PRICE = 500000;

const seed = async ({ balance = 1000000, allowDedicatedSlot = true } = {}) => {
  const building = await Building.create({ name: 'B', code: 'B1', totalFloors: 1, pricing: { hourlyRate: 15000 } });
  const vt = await VehicleType.create({ building: building._id, code: 'CAR', name: 'Ô tô' });
  const floor = await Floor.create({ building: building._id, code: 'F1', capacity: 10 });
  const slot = await ParkingSlot.create({ building: building._id, floor: floor._id, code: 'A1', vehicleType: vt._id, status: 'available' });
  const pkg = await LongTermPackage.create({
    building: building._id, vehicleType: vt._id, name: 'Tháng', code: 'M1',
    durationDays: 30, price: PRICE, allowDedicatedSlot,
  });
  const user = await User.create({ email: 'u@test.com', password: '123456', fullName: 'U', walletBalance: balance });
  return { building, vt, floor, slot, pkg, user };
};

beforeAll(connect);
afterAll(stop);
afterEach(clearAll);

describe('subscribe (mua gói + ví)', () => {
  test('thành công: trừ ví, sub active, slot reserved, có WalletTransaction', async () => {
    const { pkg, slot, user } = await seed();
    const sub = await longTerm.subscribe(user._id, { packageId: pkg._id, plateNumber: '59G2-81000', slotId: slot._id });

    expect(sub.status).toBe('active');
    expect(String(sub.slot)).toBe(String(slot._id));
    expect(sub.plateNumber).toBe('59G2-810.00');

    const u = await User.findById(user._id).select('walletBalance');
    expect(u.walletBalance).toBe(1000000 - PRICE);

    const s = await ParkingSlot.findById(slot._id);
    expect(s.status).toBe('reserved');

    const tx = await WalletTransaction.findOne({ user: user._id, reason: 'long_term_subscription' });
    expect(tx).toBeTruthy();
    expect(tx.amount).toBe(PRICE);
  });

  test('số dư không đủ → lỗi, KHÔNG tạo sub, slot vẫn available', async () => {
    const { pkg, slot, user } = await seed({ balance: 100 });
    await expect(
      longTerm.subscribe(user._id, { packageId: pkg._id, plateNumber: '59G2-81000', slotId: slot._id }),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(await LongTermSubscription.countDocuments()).toBe(0);
    const s = await ParkingSlot.findById(slot._id);
    expect(s.status).toBe('available');
  });

  test('gói không hỗ trợ slot cố định mà gửi slotId → lỗi', async () => {
    const { pkg, slot, user } = await seed({ allowDedicatedSlot: false });
    await expect(
      longTerm.subscribe(user._id, { packageId: pkg._id, plateNumber: '59G2-81000', slotId: slot._id }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('biển số đã có gói active → chặn mua trùng', async () => {
    const { pkg, slot, user } = await seed();
    await longTerm.subscribe(user._id, { packageId: pkg._id, plateNumber: '59G2-81000', slotId: slot._id });
    await expect(
      longTerm.subscribe(user._id, { packageId: pkg._id, plateNumber: '59G2-81000' }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('renew & cancel', () => {
  test('renew: gia hạn cộng dồn endDate + trừ ví tiếp', async () => {
    const { pkg, slot, user } = await seed({ balance: 2000000 });
    const sub = await longTerm.subscribe(user._id, { packageId: pkg._id, plateNumber: '59G2-81000', slotId: slot._id });
    const oldEnd = new Date(sub.endDate).getTime();

    const renewed = await longTerm.renewSubscription(user._id, sub._id);
    expect(new Date(renewed.endDate).getTime()).toBeGreaterThan(oldEnd);
    expect(renewed.status).toBe('active');

    const u = await User.findById(user._id).select('walletBalance');
    expect(u.walletBalance).toBe(2000000 - 2 * PRICE);
  });

  test('cancel trong 3 ngày: hoàn 95% + thả slot + status cancelled', async () => {
    const { pkg, slot, user } = await seed();
    const sub = await longTerm.subscribe(user._id, { packageId: pkg._id, plateNumber: '59G2-81000', slotId: slot._id });

    const res = await longTerm.cancelSubscription(user._id, sub._id, { cancelReason: 'no_longer_needed' });
    expect(res.status).toBe('cancelled');

    const s = await ParkingSlot.findById(slot._id);
    expect(s.status).toBe('available');

    const u = await User.findById(user._id).select('walletBalance');
    // 1,000,000 - 500,000 + round(500,000*0.95)=475,000 → 975,000
    expect(u.walletBalance).toBe(1000000 - PRICE + Math.round(PRICE * 0.95));
  });
});
