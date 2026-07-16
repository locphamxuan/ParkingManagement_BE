// Job gửi email best-effort → mock để không gọi SMTP.
jest.mock('../src/utils/email', () => ({
  sendNotificationEmail: jest.fn(),
  sendOtpEmail: jest.fn(),
  sendResetPasswordEmail: jest.fn(),
}));

const mongoose = require('mongoose');
const { connect, clearAll, stop } = require('./db');

const Building = require('../src/models/building/Building');
const VehicleType = require('../src/models/building/VehicleType');
const ParkingSlot = require('../src/models/building/ParkingSlot');
const LongTermSubscription = require('../src/models/policy/LongTermSubscription');
const Notification = require('../src/models/log/Notification');

const subJob = require('../src/jobs/subscriptionExpiry.job');

jest.setTimeout(120000);

const DAY = 24 * 3600 * 1000;
const MIN = 60 * 1000;
// grace giờ lấy từ package.graceDays; mkSub dùng package ObjectId rỗng → fallback 7.

const mkBuilding = () => Building.create({ name: 'B', code: 'B1', totalFloors: 1, pricing: { hourlyRate: 15000 } });

const mkSub = (extra) => LongTermSubscription.create({
  user: new mongoose.Types.ObjectId(),
  package: new mongoose.Types.ObjectId(),
  building: extra.building,
  plateNumber: '59G2-900.00',
  startDate: new Date(Date.now() - 40 * DAY),
  endDate: new Date(Date.now() + 6 * DAY),
  status: 'active',
  ...extra,
});

beforeAll(connect);
afterAll(stop);
afterEach(clearAll);

describe('subscriptionExpiry job', () => {
  test('sendExpiryReminders: nhắc trước hạn, không trùng', async () => {
    const b = await mkBuilding();
    await mkSub({ building: b._id, endDate: new Date(Date.now() + 6 * DAY) });

    await subJob.sendExpiryReminders();
    expect(await Notification.countDocuments({ type: 'subscription_expiring' })).toBe(1);

    await subJob.sendExpiryReminders(); // chạy lại
    expect(await Notification.countDocuments({ type: 'subscription_expiring' })).toBe(1); // vẫn 1
  });

  test('expireActiveSubscriptions: active→expired + báo user (gói floating không đụng slot)', async () => {
    const b = await mkBuilding();
    const slot = await ParkingSlot.create({ building: b._id, floor: new mongoose.Types.ObjectId(), code: 'A1', status: 'available' });
    const sub = await mkSub({ building: b._id, endDate: new Date(Date.now() - 1 * DAY) });

    await subJob.expireActiveSubscriptions();

    const s = await LongTermSubscription.findById(sub._id);
    expect(s.status).toBe('expired');
    // Gói floating không giữ slot → job hết hạn không thay đổi trạng thái slot nào.
    expect((await ParkingSlot.findById(slot._id)).status).toBe('available');
    expect(await Notification.countDocuments({ type: 'subscription_expired' })).toBe(1);
  });
});
