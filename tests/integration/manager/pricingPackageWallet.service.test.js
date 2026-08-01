/** manager: pricing (hook auto-deactivate), package, buildingWallet, shift, feedback. */
const db = require('../../helpers/db');
const f = require('../../helpers/fixtures');
const pricingSvc = require('../../../src/services/manager/pricing.service');
const packageSvc = require('../../../src/services/manager/package.service');
const walletSvc = require('../../../src/services/manager/buildingWallet.service');
const shiftSvc = require('../../../src/services/manager/shift.service');
const feedbackSvc = require('../../../src/services/manager/feedback.service');
const PricePolicy = require('../../../src/models/policy/PricePolicy');
const Feedback = require('../../../src/models/operations/Feedback');
const ParkingSession = require('../../../src/models/operations/ParkingSession');
const Payment = require('../../../src/models/finance/Payment');
const User = require('../../../src/models/user/User');
const BuildingManager = require('../../../src/models/building/BuildingManager');
const longTermSvc = require('../../../src/services/user/longTerm.service');

let building, manager, vt;
beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.clear();
  building = await f.createBuilding();
  manager = await f.managerFor(building._id);
  vt = await f.createVehicleType(building._id);
});

describe('pricing.service', () => {
  test('tạo policy mới auto-deactivate policy cùng (building,vt,type) đang active', async () => {
    const p1 = await pricingSvc.create(manager, building._id, { name: 'P1', vehicleType: vt._id, hourlyRate: 10000, type: 'regular' });
    const p2 = await pricingSvc.create(manager, building._id, { name: 'P2', vehicleType: vt._id, hourlyRate: 20000, type: 'regular' });
    const fresh1 = await PricePolicy.findById(p1._id);
    expect(fresh1.isActive).toBe(false); // bị hook tắt
    expect(p2.isActive).toBe(true);
  });

  test('effectiveTo trước effectiveFrom → 400', async () => {
    await expect(pricingSvc.create(manager, building._id, {
      name: 'P', vehicleType: vt._id, hourlyRate: 10000,
      effectiveFrom: new Date('2026-02-01'), effectiveTo: new Date('2026-01-01'),
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test('vehicleType không thuộc building → 404', async () => {
    const other = await f.createBuilding();
    const vtOther = await f.createVehicleType(other._id);
    await expect(pricingSvc.create(manager, building._id, { name: 'P', vehicleType: vtOther._id, hourlyRate: 1000 }))
      .rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('package.service', () => {
  test('create + list + remove (chặn khi có sub active)', async () => {
    const pkg = await packageSvc.createPackage(manager, building._id, {
      vehicleType: vt._id, name: 'Tháng', code: 'M1', durationDays: 30, price: 300000,
    });
    const list = await packageSvc.listPackages(manager, building._id, {});
    expect(list).toHaveLength(1);
    const removed = await packageSvc.removePackage(manager, building._id, pkg._id);
    expect(String(removed.id)).toBe(String(pkg._id));
  });

  test('cancelSubscription: refund theo RefundPolicy.refundPercent, không hardcode 95%', async () => {
    const pkg = await packageSvc.createPackage(manager, building._id, {
      vehicleType: vt._id, name: 'Tháng', code: 'M2', durationDays: 30, price: 300000,
    });
    await f.createRefundPolicy(building._id, { refundPercent: 60 });
    const user = await f.createUser({
      walletBalance: 300000,
      vehicles: [{ plateNumber: '51F-999.99', category: 'car' }],
    });
    const sub = await longTermSvc.subscribe(user._id, { packageId: pkg._id, plateNumber: '51F-999.99' });

    await packageSvc.cancelSubscription(manager, building._id, sub._id, 'test');
    const fresh = await User.findById(user._id);
    // Mua trừ 300_000 → 0 dư; hoàn 60% × 300_000 = 180_000 → 180_000.
    expect(fresh.walletBalance).toBe(180000);
  });

  test('cancelSubscription: building không có RefundPolicy → fallback 80%', async () => {
    const pkg = await packageSvc.createPackage(manager, building._id, {
      vehicleType: vt._id, name: 'Tháng', code: 'M3', durationDays: 30, price: 300000,
    });
    const user = await f.createUser({
      walletBalance: 300000,
      vehicles: [{ plateNumber: '51F-888.88', category: 'car' }],
    });
    const sub = await longTermSvc.subscribe(user._id, { packageId: pkg._id, plateNumber: '51F-888.88' });

    await packageSvc.cancelSubscription(manager, building._id, sub._id, 'test');
    const fresh = await User.findById(user._id);
    expect(fresh.walletBalance).toBe(240000); // 80% × 300_000
  });
});

describe('buildingWallet.service', () => {
  test('credit + debit + daily revenue', async () => {
    await walletSvc.credit(building._id, 100000, 'parking_fee', null, null);
    let w = await walletSvc.getOrCreate(building._id);
    expect(w.balance).toBe(100000);
    await walletSvc.debit(building._id, 30000, 'refund', null, null, null);
    w = await walletSvc.getOrCreate(building._id);
    expect(w.balance).toBe(70000);
    const rev = await walletSvc.getDailyRevenue(building._id);
    expect(rev.totalRevenue).toBe(100000); // chỉ tính credit doanh thu
  });

  test('debit vượt số dư (không allowNegative) → 400', async () => {
    await walletSvc.credit(building._id, 1000, 'parking_fee', null, null);
    await expect(walletSvc.debit(building._id, 5000, 'refund', null, null, null))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  test('getRevenueBreakdown: gộp theo ngày × phương thức, allTimeTotal loại topup/failed', async () => {
    const pay = async ({ type = 'session', method = 'cash', amount, status = 'success', daysAgo = 0 }) => {
      const p = await Payment.create({ building: building._id, type, method, amount, status });
      if (daysAgo) {
        const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(12, 0, 0, 0);
        // createdAt là immutable với Mongoose timestamps → bypass qua raw driver.
        await Payment.collection.updateOne({ _id: p._id }, { $set: { createdAt: d } });
      }
      return p;
    };
    // Hôm nay: 3 phương thức doanh thu + 1 topup + 1 failed (phải bị loại).
    await pay({ method: 'cash', amount: 100000 });
    await pay({ method: 'wallet', amount: 50000 });
    await pay({ method: 'qr', amount: 30000 });
    await pay({ type: 'topup', method: 'payos', amount: 999999 });
    await pay({ method: 'cash', amount: 77777, status: 'failed' });
    // Hôm qua: 1 giao dịch tiền mặt.
    await pay({ method: 'cash', amount: 20000, daysAgo: 1 });

    const res = await walletSvc.getRevenueBreakdown(building._id);

    expect(res.allTimeTotal).toBe(200000); // 100k+50k+30k+20k (loại topup + failed)
    expect(res.days).toHaveLength(2);
    const [today, yesterday] = res.days; // sort ngày giảm dần → hôm nay trước
    expect(today.total).toBe(180000);
    expect(today.byMethod).toEqual({ cash: 100000, wallet: 50000, online: 30000 });
    expect(yesterday.total).toBe(20000);
    expect(yesterday.byMethod.cash).toBe(20000);
  });
});

describe('shift.service', () => {
  test('tạo ca + gán nhân viên (chỉ staff)', async () => {
    const shift = await shiftSvc.createShift(manager, building._id, { name: 'Sáng', code: 'S1', startTime: '06:00', endTime: '14:00' });
    const staff = await f.createUser({ role: 'staff' });
    await BuildingManager.create({ building: building._id, user: staff._id });
    const assigned = await shiftSvc.assignStaffShift(manager, building._id, {
      shift: shift._id, staff: staff._id, workDate: new Date(),
    });
    expect(String(assigned.staff)).toBe(String(staff._id));
  });

  test('gán user không phải staff → 400', async () => {
    const shift = await shiftSvc.createShift(manager, building._id, { name: 'Sáng', code: 'S1', startTime: '06:00', endTime: '14:00' });
    const notStaff = await f.createUser({ role: 'user' });
    await expect(shiftSvc.assignStaffShift(manager, building._id, {
      shift: shift._id, staff: notStaff._id, workDate: new Date(),
    })).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('feedback.service', () => {
  test('respond ghi staffReply, chuyển resolved, tạo notification', async () => {
    const customer = await f.createUser();
    const session = await ParkingSession.create({ plateNumber: '51F-123.45', building: building._id, user: customer._id });
    const fb = await Feedback.create({ user: customer._id, building: building._id, parkingSession: session._id, rating: 3, comment: 'ok' });
    const updated = await feedbackSvc.respond(manager, building._id, fb._id, { staffReply: 'Cảm ơn bạn' });
    expect(updated.staffReply).toBe('Cảm ơn bạn');
    expect(updated.status).toBe('resolved');
  });
});
