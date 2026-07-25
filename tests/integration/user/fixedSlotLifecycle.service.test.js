/**
 * Invariant vòng đời SLOT CỐ ĐỊNH (P1-A) — kiểm chứng SIDE-EFFECT thật trong DB,
 * không chỉ status code:
 *  - gói hết hạn (job + self-heal) phải nhả slot;
 *  - gia hạn phải claim slot TRƯỚC khi trừ ví, thất bại thì không trừ đồng nào;
 *  - mọi đường checkout của gói còn hạn phải trả slot về 'reserved'.
 */
const db = require('../../helpers/db');
const f = require('../../helpers/fixtures');
const { LongTermSubscription, ParkingSlot, ParkingSession, User } = require('../../../src/models');
const longTermService = require('../../../src/services/user/longTerm.service');
const subscriptionExpiryJob = require('../../../src/jobs/subscriptionExpiry.job');
const { checkIn } = require('../../../src/services/staff/parkingSession/checkIn.service');
const { checkOut } = require('../../../src/services/staff/parkingSession/checkOut.service');

jest.setTimeout(180000);

const IMG = 'data:image/png;base64,AAAA';
const DAY = 24 * 60 * 60 * 1000;
const PLATE = '51F-123.45';

let building;
let floor;
let zone;
let vehicleType;
let owner;
let staff;
let pkg;
let slot;

beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });

beforeEach(async () => {
  await db.clear();
  building = await f.createBuilding({ operatingHours: { open: '00:00', close: '23:59' } });
  vehicleType = await f.createVehicleType(building._id);
  floor = await f.createFloor(building._id, { capacity: 100 });
  zone = await f.createZone(building._id, floor._id, vehicleType._id, { usageType: 'subscriber' });
  slot = await f.createSlot(building._id, floor._id, {
    zone: zone._id,
    vehicleType: vehicleType._id,
    usageType: 'subscriber',
    status: 'reserved',
  });
  owner = await f.createUser({
    walletBalance: 1_000_000,
    licensePlates: [{ plateNumber: PLATE, vehicleType: 'car' }],
  });
  staff = await f.createUser({ role: 'staff' });
  staff.assignedBuildings = [building._id];
  const shift = await f.createShift(building._id);
  await f.createStaffShift(building._id, staff._id, shift._id, { status: 'active' });
  pkg = await f.createPackage(building._id, vehicleType._id, { price: 300_000, maxHoursPerDay: 24 });
});

const mkSubscription = (over = {}) => LongTermSubscription.create({
  user: owner._id,
  package: pkg._id,
  building: building._id,
  plateNumber: PLATE,
  slot: slot._id,
  startDate: new Date(Date.now() - 30 * DAY),
  endDate: new Date(Date.now() + DAY),
  status: 'active',
  ...over,
});

const slotStatus = async () => (await ParkingSlot.findById(slot._id)).status;
const walletOf = async () => (await User.findById(owner._id)).walletBalance;

describe('hết hạn → nhả slot', () => {
  test('job hết hạn: subscription expired VÀ slot reserved → available', async () => {
    const sub = await mkSubscription({ endDate: new Date(Date.now() - DAY) });

    await subscriptionExpiryJob.expireActiveSubscriptions();

    expect((await LongTermSubscription.findById(sub._id)).status).toBe('expired');
    expect(await slotStatus()).toBe('available');
  });

  test('self-heal lúc check-in: gói quá hạn được đánh dấu expired và slot được nhả', async () => {
    const sub = await mkSubscription({ endDate: new Date(Date.now() - DAY) });
    // Slot walk-in để lượt check-in vẫn đi tiếp được sau khi gói bị self-heal.
    await f.createSlot(building._id, floor._id, {
      vehicleType: vehicleType._id,
      usageType: 'walk_in',
      status: 'available',
    });

    await checkIn(staff, {
      building: building._id,
      plateNumber: PLATE,
      vehicleType: vehicleType._id,
      portraitImage: IMG,
      plateImage: IMG,
    });

    expect((await LongTermSubscription.findById(sub._id)).status).toBe('expired');
    expect(await slotStatus()).toBe('available');
  });
});

describe('gia hạn gói đã hết hạn', () => {
  test('slot cũ còn trống → claim về reserved và trừ ví đúng giá gói', async () => {
    const sub = await mkSubscription({ status: 'expired', endDate: new Date(Date.now() - DAY) });
    await ParkingSlot.updateOne({ _id: slot._id }, { $set: { status: 'available' } });
    const balanceBefore = await walletOf();

    await longTermService.renewSubscription(owner._id, sub._id);

    expect(await slotStatus()).toBe('reserved');
    expect(await walletOf()).toBe(balanceBefore - pkg.price);
    expect((await LongTermSubscription.findById(sub._id)).status).toBe('active');
  });

  test('slot cũ đã thuộc gói khác → 409 FIXED_SLOT_UNAVAILABLE, KHÔNG trừ ví', async () => {
    const sub = await mkSubscription({ status: 'expired', endDate: new Date(Date.now() - DAY) });
    const rival = await f.createUser({
      licensePlates: [{ plateNumber: '51F-999.99', vehicleType: 'car' }],
    });
    await LongTermSubscription.create({
      user: rival._id,
      package: pkg._id,
      building: building._id,
      plateNumber: '51F-999.99',
      slot: slot._id,
      startDate: new Date(Date.now() - DAY),
      endDate: new Date(Date.now() + 30 * DAY),
      status: 'active',
    });
    const balanceBefore = await walletOf();

    await expect(longTermService.renewSubscription(owner._id, sub._id)).rejects.toMatchObject({
      statusCode: 409,
      errorCode: 'FIXED_SLOT_UNAVAILABLE',
      details: { requiresSlotSelection: true },
    });

    expect(await walletOf()).toBe(balanceBefore);
    expect((await LongTermSubscription.findById(sub._id)).status).toBe('expired');
  });

  test('xe của chính gói đang chiếm slot → gia hạn OK, checkout trả slot về reserved', async () => {
    const sub = await mkSubscription();
    const session = await checkIn(staff, {
      building: building._id,
      plateNumber: PLATE,
      vehicleType: vehicleType._id,
      portraitImage: IMG,
      plateImage: IMG,
    });
    expect(await slotStatus()).toBe('occupied');

    await longTermService.renewSubscription(owner._id, sub._id);
    expect(await slotStatus()).toBe('occupied');

    await checkOut(staff, session._id, { paymentMethod: 'cash' });

    expect(await slotStatus()).toBe('reserved');
    expect((await ParkingSession.findById(session._id)).status).toBe('completed');
  });
});

describe('checkout gói còn hạn trả slot về reserved ở mọi phương thức', () => {
  test.each(['cash', 'wallet'])('paymentMethod=%s → slot reserved, không phải available', async (paymentMethod) => {
    await mkSubscription();
    const session = await checkIn(staff, {
      building: building._id,
      plateNumber: PLATE,
      vehicleType: vehicleType._id,
      portraitImage: IMG,
      plateImage: IMG,
    });
    expect(await slotStatus()).toBe('occupied');

    await checkOut(staff, session._id, { paymentMethod });

    expect(await slotStatus()).toBe('reserved');
  });
});
