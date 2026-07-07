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
const Reservation = require('../src/models/operations/Reservation');
const Notification = require('../src/models/log/Notification');

const subJob = require('../src/jobs/subscriptionExpiry.job');
const resJob = require('../src/jobs/reservationExpiry.job');

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

  test('expireActiveSubscriptions: active→expired, GIỮ slot, báo user', async () => {
    const b = await mkBuilding();
    const slot = await ParkingSlot.create({ building: b._id, floor: new mongoose.Types.ObjectId(), code: 'A1', status: 'reserved' });
    const sub = await mkSub({ building: b._id, endDate: new Date(Date.now() - 1 * DAY), slot: slot._id });

    await subJob.expireActiveSubscriptions();

    const s = await LongTermSubscription.findById(sub._id);
    expect(s.status).toBe('expired');
    expect(s.lastGraceReminderAt).toBeTruthy();
    expect((await ParkingSlot.findById(slot._id)).status).toBe('reserved'); // GIỮ slot
    expect(await Notification.countDocuments({ type: 'subscription_expired' })).toBe(1);
  });

  test('sendGraceReminders: 1 lần/ngày trong grace', async () => {
    const b = await mkBuilding();
    const slot = await ParkingSlot.create({ building: b._id, floor: new mongoose.Types.ObjectId(), code: 'A1', status: 'reserved' });
    await mkSub({
      building: b._id, status: 'expired', slot: slot._id, slotReleased: false,
      endDate: new Date(Date.now() - 2 * DAY), // còn trong grace 7
      lastGraceReminderAt: new Date(Date.now() - 1 * DAY), // hôm qua
    });

    await subJob.sendGraceReminders();
    expect(await Notification.countDocuments({ type: 'subscription_expiring' })).toBe(1);

    await subJob.sendGraceReminders(); // cùng ngày → không gửi nữa
    expect(await Notification.countDocuments({ type: 'subscription_expiring' })).toBe(1);
  });

  test('releaseGraceSlots: quá grace → thả slot + báo; trong grace → giữ', async () => {
    const b = await mkBuilding();
    // quá grace (endDate cách 8 ngày > 7)
    const slotOld = await ParkingSlot.create({ building: b._id, floor: new mongoose.Types.ObjectId(), code: 'A1', status: 'reserved' });
    const subOld = await mkSub({ building: b._id, status: 'expired', slot: slotOld._id, slotReleased: false, endDate: new Date(Date.now() - 8 * DAY), plateNumber: '59G2-901.00' });
    // còn trong grace
    const slotNew = await ParkingSlot.create({ building: b._id, floor: new mongoose.Types.ObjectId(), code: 'A2', status: 'reserved' });
    await mkSub({ building: b._id, status: 'expired', slot: slotNew._id, slotReleased: false, endDate: new Date(Date.now() - 2 * DAY), plateNumber: '59G2-902.00' });

    await subJob.releaseGraceSlots();

    expect((await ParkingSlot.findById(slotOld._id)).status).toBe('available');
    expect((await LongTermSubscription.findById(subOld._id)).slotReleased).toBe(true);
    expect((await ParkingSlot.findById(slotNew._id)).status).toBe('reserved'); // còn grace → giữ
    expect(await Notification.countDocuments({ type: 'subscription_slot_released' })).toBe(1);
  });
});

describe('reservationExpiry job', () => {
  const mkRes = (b, extra) => Reservation.create({
    code: `RSV-${Math.random().toString(36).slice(2, 8)}`,
    user: new mongoose.Types.ObjectId(), building: b._id, vehicleType: new mongoose.Types.ObjectId(),
    plateNumber: '59G2-903.00', status: 'confirmed', ...extra,
  });

  test('quá hold (30 phút) → expired + thả slot + báo; chưa quá → giữ', async () => {
    const b = await mkBuilding();
    const slot = await ParkingSlot.create({ building: b._id, floor: new mongoose.Types.ObjectId(), code: 'A1', status: 'reserved' });
    const stale = await mkRes(b, { startTime: new Date(Date.now() - 40 * MIN), slot: slot._id, plateNumber: '59G2-903.00' });
    const fresh = await mkRes(b, { startTime: new Date(Date.now() - 10 * MIN), plateNumber: '59G2-904.00' });

    await resJob.expireStaleReservations();

    expect((await Reservation.findById(stale._id)).status).toBe('expired');
    expect((await ParkingSlot.findById(slot._id)).status).toBe('available');
    expect((await Reservation.findById(fresh._id)).status).toBe('confirmed'); // chưa quá hold
    expect(await Notification.countDocuments({ type: 'reservation_expired' })).toBe(1);
  });

  test('notifyOverstayingReservations: checked_in quá endTime → báo 1 lần, không trùng', async () => {
    const b = await mkBuilding();
    // đang đỗ (checked_in) và đã quá endTime
    const over = await mkRes(b, {
      status: 'checked_in', plateNumber: '59G2-905.00',
      startTime: new Date(Date.now() - 4 * 3600 * 1000),
      endTime: new Date(Date.now() - 1 * 3600 * 1000),
    });
    // checked_in nhưng còn trong giờ → không báo
    await mkRes(b, {
      status: 'checked_in', plateNumber: '59G2-906.00',
      startTime: new Date(Date.now() - 1 * 3600 * 1000),
      endTime: new Date(Date.now() + 1 * 3600 * 1000),
    });

    await resJob.notifyOverstayingReservations();
    expect(await Notification.countDocuments({ type: 'reservation_overstay' })).toBe(1);
    expect((await Reservation.findById(over._id)).overstayNotifiedAt).toBeTruthy();

    await resJob.notifyOverstayingReservations(); // chạy lại → không trùng
    expect(await Notification.countDocuments({ type: 'reservation_overstay' })).toBe(1);
  });
});
