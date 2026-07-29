/**
 * Incident/penalty flow: manager-only penalty APPROVAL (rule 1), auto plate-account
 * lookup + escalation cho manager (rule 2), thu phí phạt lúc STAFF check-out xe vi
 * phạm — cash pending / phương thức khác hoàn tất ngay (rule 3).
 */
const db = require('../../helpers/db');
const f = require('../../helpers/fixtures');
const userIncidentSvc = require('../../../src/services/user/incident.service');
const staffIncidentSvc = require('../../../src/services/staff/incident.service');
const managerIncidentSvc = require('../../../src/services/manager/incident.service');
const { checkOut } = require('../../../src/services/staff/parkingSession/checkOut.service');
const buildingWalletSvc = require('../../../src/services/manager/buildingWallet.service');
const ParkingSession = require('../../../src/models/operations/ParkingSession');
const ParkingSlot = require('../../../src/models/building/ParkingSlot');
const User = require('../../../src/models/user/User');
const Payment = require('../../../src/models/finance/Payment');
const LongTermSubscription = require('../../../src/models/policy/LongTermSubscription');
const ViolationType = require('../../../src/models/policy/ViolationType');

let building, staff, manager, reporter;

beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.clear();
  building = await f.createBuilding();
  staff = await f.createUser({ role: 'staff' });
  staff.assignedBuildings = [building._id];
  manager = await f.managerFor(building._id);
  reporter = await f.createUser({ role: 'user' });
  // checkOut() đòi staff có ca hôm nay.
  const shift = await f.createShift(building._id);
  await f.createStaffShift(building._id, staff._id, shift._id);
  // User-facing incident.service chỉ chấp nhận type='slot_occupied' nếu có ViolationType
  // khớp code này cho building — seed sẵn (mô phỏng manager đã cấu hình bảng giá).
  await ViolationType.create({ building: building._id, code: 'slot_occupied', label: 'Occupying a reserved slot', fee: 100000 });
  // Người báo cáo phải có QUAN HỆ thật với tòa nhà (đã/đang gửi xe hoặc có gói) —
  // BE không cho gắn sự cố vào một tòa nhà bất kỳ do client gửi lên.
  await ParkingSession.create({
    plateNumber: '51F-000.11',
    building: building._id,
    user: reporter._id,
    status: 'completed',
    entryTime: new Date(Date.now() - 3 * 3600 * 1000),
    exitTime: new Date(Date.now() - 2 * 3600 * 1000),
  });
});

const activeSession = async (plateNumber, over = {}) => {
  const floor = await f.createFloor(building._id);
  const slot = await f.createSlot(building._id, floor._id, { status: 'occupied' });
  const session = await ParkingSession.create({
    plateNumber, building: building._id, slot: slot._id, status: 'active', staff: staff._id, ...over,
  });
  return { slot, session };
};

describe('rule 2 — auto plate lookup + escalation khi user report', () => {
  test('biển không có account trong building → escalated + plateAccountFound false', async () => {
    const res = await userIncidentSvc.createIncident(reporter._id, {
      type: 'slot_occupied', buildingId: building._id, violatorPlate: '51F-999.99', note: 'chiếm chỗ',
    });
    expect(res.item.status).toBe('escalated');
    expect(res.item.plateAccountFound).toBe(false);
  });

  test('biển có subscription active trong building → open + plateAccountFound true', async () => {
    const vt = await f.createVehicleType(building._id);
    const pkg = await f.createPackage(building._id, vt._id);
    await LongTermSubscription.create({
      user: reporter._id, package: pkg._id, building: building._id, plateNumber: '51F-123.45',
      startDate: new Date(), endDate: new Date(Date.now() + 30 * 86400000), status: 'active',
    });
    const res = await userIncidentSvc.createIncident(reporter._id, {
      type: 'slot_occupied', buildingId: building._id, violatorPlate: '51F-123.45', note: 'chiếm chỗ',
    });
    expect(res.item.status).toBe('open');
    expect(res.item.plateAccountFound).toBe(true);
  });

  test('incident escalated: staff PATCH bất kỳ field nào cũng 403, manager PATCH được', async () => {
    const created = await userIncidentSvc.createIncident(reporter._id, {
      type: 'slot_occupied', buildingId: building._id, violatorPlate: '51F-888.88',
    });
    expect(created.item.status).toBe('escalated');

    await expect(
      staffIncidentSvc.updateIncident(staff, created.item._id, { resolutionNote: 'đang xử lý' }),
    ).rejects.toMatchObject({ errorCode: 'ESCALATED_MANAGER_ONLY' });

    const resolved = await managerIncidentSvc.resolve(manager, building._id, created.item._id, {
      status: 'investigating',
    });
    expect(resolved.item.status).toBe('investigating');
  });
});

describe('rule 1 — chỉ manager DUYỆT phí phạt', () => {
  test('staff gọi action penalize_violator → 403 MANAGER_ONLY_ACTION', async () => {
    await activeSession('51F-111.11');
    const incident = await staffIncidentSvc.createIncident(staff, {
      type: 'slot_occupied', buildingId: building._id, note: 'test',
    });
    await expect(
      staffIncidentSvc.updateIncident(staff, incident.item._id, {
        action: 'penalize_violator', violatorPlate: '51F-111.11', penaltyFee: 50000,
      }),
    ).rejects.toMatchObject({ errorCode: 'MANAGER_ONLY_ACTION' });
  });

  test('status "penalty_pending" không thể set tay qua status field thường', async () => {
    const incident = await staffIncidentSvc.createIncident(staff, {
      type: 'slot_occupied', buildingId: building._id,
    });
    await expect(
      managerIncidentSvc.resolve(manager, building._id, incident.item._id, { status: 'penalty_pending' }),
    ).rejects.toMatchObject({ errorCode: 'INVALID_STATUS' });
  });

  test('manager duyệt phí phạt KHÔNG cần xe đang active trong bãi (chỉ ghi nhận, chưa thu)', async () => {
    // type='other' → không có mức phạt định sẵn, manager tự nhập tay.
    const incident = await staffIncidentSvc.createIncident(staff, {
      type: 'other', buildingId: building._id,
    });
    const resolved = await managerIncidentSvc.resolve(manager, building._id, incident.item._id, {
      action: 'penalize_violator', violatorPlate: '51F-999.11', penaltyFee: 60000,
    });
    expect(resolved.item.status).toBe('penalty_pending');
    expect(resolved.item.penaltyFee).toBe(60000);
    expect(`${resolved.item.penaltyApprovedBy?._id || resolved.item.penaltyApprovedBy}`).toBe(`${manager._id}`);
    // Chưa tạo Payment nào — chưa thu tiền.
    expect(await Payment.countDocuments({})).toBe(0);
  });

  test('không có ViolationType khớp type và không nhập penaltyFee → 400 PENALTY_FEE_REQUIRED (không còn default ruleViolationFee)', async () => {
    // Type tuỳ ý KHÔNG khớp bất kỳ ViolationType nào đã seed (chỉ staff.createIncident mới
    // tạo được incident với type tự do — user-facing service validate type khớp bảng giá).
    const incident = await staffIncidentSvc.createIncident(staff, {
      type: 'unclassified_violation', buildingId: building._id,
    });
    await expect(
      managerIncidentSvc.resolve(manager, building._id, incident.item._id, {
        action: 'penalize_violator', violatorPlate: '51F-444.44',
      }),
    ).rejects.toMatchObject({ errorCode: 'PENALTY_FEE_REQUIRED' });
  });

  test("type='other' luôn cần manager tự nhập penaltyFee (không có mức phạt định sẵn)", async () => {
    const incident = await staffIncidentSvc.createIncident(staff, {
      type: 'other', buildingId: building._id,
    });
    await expect(
      managerIncidentSvc.resolve(manager, building._id, incident.item._id, {
        action: 'penalize_violator', violatorPlate: '51F-555.55',
      }),
    ).rejects.toMatchObject({ errorCode: 'PENALTY_FEE_REQUIRED' });

    const resolved = await managerIncidentSvc.resolve(manager, building._id, incident.item._id, {
      action: 'penalize_violator', violatorPlate: '51F-555.55', penaltyFee: 75000,
    });
    expect(resolved.item.penaltyFee).toBe(75000);
  });

  test('type khớp 1 ViolationType đã cấu hình → phí bị ÉP theo bảng giá, penaltyFee manager gửi lên bị bỏ qua', async () => {
    // 'slot_occupied' đã seed sẵn ở beforeEach với fee=100000.
    const incident = await staffIncidentSvc.createIncident(staff, {
      type: 'slot_occupied', buildingId: building._id,
    });
    // Manager cố gửi 999999 — phải bị bỏ qua, luôn áp đúng 100000 từ bảng giá.
    const resolved = await managerIncidentSvc.resolve(manager, building._id, incident.item._id, {
      action: 'penalize_violator', violatorPlate: '51F-666.77', penaltyFee: 999999,
    });
    expect(resolved.item.penaltyFee).toBe(100000);
  });

  test('incident đang penalty_pending → không ai đổi status thủ công được (staff lẫn manager), tránh mất dấu phí chưa thu', async () => {
    const incident = await staffIncidentSvc.createIncident(staff, {
      type: 'slot_occupied', buildingId: building._id,
    });
    await managerIncidentSvc.resolve(manager, building._id, incident.item._id, {
      action: 'penalize_violator', violatorPlate: '51F-666.66', penaltyFee: 20000,
    });

    await expect(
      staffIncidentSvc.updateIncident(staff, incident.item._id, { status: 'open' }),
    ).rejects.toMatchObject({ errorCode: 'PENALTY_PENDING_LOCKED' });

    await expect(
      managerIncidentSvc.resolve(manager, building._id, incident.item._id, { status: 'resolved' }),
    ).rejects.toMatchObject({ errorCode: 'PENALTY_PENDING_LOCKED' });

    // Note-only update (không đổi status) vẫn phải qua bình thường.
    const noted = await managerIncidentSvc.resolve(manager, building._id, incident.item._id, {
      resolutionNote: 'đang chờ xe ra cổng',
    });
    expect(noted.item.status).toBe('penalty_pending');
    expect(noted.item.resolutionNote).toBe('đang chờ xe ra cổng');
  });

  test('incident đã resolved/closed → không duyệt phạt lại được (tránh double-charge biển số)', async () => {
    const incident = await staffIncidentSvc.createIncident(staff, {
      type: 'slot_occupied', buildingId: building._id,
    });
    await managerIncidentSvc.resolve(manager, building._id, incident.item._id, { status: 'resolved' });

    await expect(
      managerIncidentSvc.resolve(manager, building._id, incident.item._id, {
        action: 'penalize_violator', violatorPlate: '51F-888.88', penaltyFee: 30000,
      }),
    ).rejects.toMatchObject({ errorCode: 'INCIDENT_ALREADY_RESOLVED' });
  });
});

describe('rule 3 — staff check-out xe vi phạm mới thực thu; cash pending / phương thức khác hoàn tất ngay', () => {
  test('manager duyệt cash → staff check-out xe vi phạm → Payment RIÊNG pending, ví toà chưa cộng; confirm xong mới cộng', async () => {
    const { session } = await activeSession('51F-222.22');
    // type='slot_occupied' đã seed sẵn ViolationType fee=100000 (beforeEach) — phí bị ép theo đó.
    const incident = await staffIncidentSvc.createIncident(staff, { type: 'slot_occupied', buildingId: building._id });

    await managerIncidentSvc.resolve(manager, building._id, incident.item._id, {
      action: 'penalize_violator', violatorPlate: '51F-222.22',
    });

    const before = await buildingWalletSvc.getOrCreate(building._id);

    // Staff check-out xe vi phạm tại cổng như bình thường (cash).
    await checkOut(staff, session._id, { paymentMethod: 'cash' });

    const penaltyPayment = await Payment.findOne({ parkingSession: session._id, amount: 100000 });
    expect(penaltyPayment).toBeTruthy();
    expect(penaltyPayment.status).toBe('pending');
    expect(`${penaltyPayment.incident}`).toBe(`${incident.item._id}`);

    // Payment phí gửi xe bình thường KHÁC với payment phí phạt (2 dòng tách bạch).
    const allPayments = await Payment.find({ parkingSession: session._id });
    expect(allPayments.length).toBe(2);

    const afterPending = await buildingWalletSvc.getOrCreate(building._id);
    expect(afterPending.balance).toBe(before.balance); // cash chưa cộng ví

    await buildingWalletSvc.confirmCash(building._id, penaltyPayment._id, manager._id);
    const afterConfirm = await buildingWalletSvc.getOrCreate(building._id);
    expect(afterConfirm.balance).toBe(before.balance + 100000);

    const Incident = require('../../../src/models/log/Incident');
    const freshIncident = await Incident.findById(incident.item._id);
    expect(freshIncident.status).toBe('resolved');
    expect(freshIncident.paymentMethod).toBe('cash');
    expect(`${freshIncident.payment}`).toBe(`${penaltyPayment._id}`);
  });

  test('manager duyệt, staff check-out xe vi phạm bằng ví → trừ ví người vi phạm + cộng ví toà ngay lập tức', async () => {
    // Đủ dư cho cả phí gửi xe LẪN phí phạt bị ép 100000 (ViolationType seed ở beforeEach).
    const violator = await f.createUser({ walletBalance: 500000 });
    const { session, slot } = await activeSession('51F-333.33', { user: violator._id });
    const incident = await staffIncidentSvc.createIncident(staff, { type: 'slot_occupied', buildingId: building._id });

    await managerIncidentSvc.resolve(manager, building._id, incident.item._id, {
      action: 'penalize_violator', violatorPlate: '51F-333.33',
    });

    const before = await buildingWalletSvc.getOrCreate(building._id);
    await checkOut(staff, session._id, { paymentMethod: 'wallet' });

    const freshViolator = await User.findById(violator._id);
    // Trừ cả phí gửi xe (wallet) LẪN phí phạt (wallet) — chỉ assert phần chênh lệch >= phí phạt.
    expect(freshViolator.walletBalance).toBeLessThanOrEqual(500000 - 100000);

    const after = await buildingWalletSvc.getOrCreate(building._id);
    expect(after.balance).toBeGreaterThanOrEqual(before.balance + 100000);

    const freshSlot = await ParkingSlot.findById(slot._id);
    expect(freshSlot.status).toBe('available');
  });

  test('staff check-out xe KHÔNG liên quan (biển khác) → không đụng tới incident đang penalty_pending', async () => {
    const { session: violatorSession } = await activeSession('51F-777.77');
    const { session: otherSession } = await activeSession('51F-000.00');
    const incident = await staffIncidentSvc.createIncident(staff, { type: 'slot_occupied', buildingId: building._id });
    await managerIncidentSvc.resolve(manager, building._id, incident.item._id, {
      action: 'penalize_violator', violatorPlate: '51F-777.77', penaltyFee: 40000,
    });

    await checkOut(staff, otherSession._id, { paymentMethod: 'cash' });

    const Incident = require('../../../src/models/log/Incident');
    const stillPending = await Incident.findById(incident.item._id);
    expect(stillPending.status).toBe('penalty_pending');
    expect(await Payment.countDocuments({ parkingSession: violatorSession._id })).toBe(0);
  });
});

describe('user incident.service — type động theo bảng giá vi phạm của manager (không hard code)', () => {
  test('user cannot report an incident in an unrelated building or attach its slot', async () => {
    const unrelatedBuilding = await f.createBuilding();
    const unrelatedFloor = await f.createFloor(unrelatedBuilding._id);
    const unrelatedSlot = await f.createSlot(unrelatedBuilding._id, unrelatedFloor._id);

    await expect(
      userIncidentSvc.createIncident(reporter._id, {
        type: 'other', buildingId: unrelatedBuilding._id,
      }),
    ).rejects.toMatchObject({ errorCode: 'BUILDING_RELATION_REQUIRED' });

    await expect(
      userIncidentSvc.createIncident(reporter._id, {
        type: 'other', buildingId: building._id, slotId: unrelatedSlot._id,
      }),
    ).rejects.toMatchObject({ errorCode: 'SLOT_BUILDING_MISMATCH' });
  });

  test('staff cannot attach a parking session from another building', async () => {
    const unrelatedBuilding = await f.createBuilding();
    const foreignSession = await ParkingSession.create({
      building: unrelatedBuilding._id,
      plateNumber: '51F-800.80',
      status: 'active',
    });

    await expect(
      staffIncidentSvc.createIncident(staff, {
        type: 'other', buildingId: building._id, parkingSessionId: foreignSession._id,
      }),
    ).rejects.toMatchObject({ errorCode: 'PARKING_SESSION_BUILDING_MISMATCH' });
  });

  test('type là loại vi phạm chưa được manager cấu hình → 400 INVALID_INCIDENT_TYPE', async () => {
    await expect(
      userIncidentSvc.createIncident(reporter._id, {
        type: 'never_configured_type', buildingId: building._id,
      }),
    ).rejects.toMatchObject({ errorCode: 'INVALID_INCIDENT_TYPE' });
  });

  test('type khớp 1 ViolationType active của building → tạo thành công', async () => {
    // 'slot_occupied' đã được seed sẵn ở beforeEach.
    const res = await userIncidentSvc.createIncident(reporter._id, {
      type: 'slot_occupied', buildingId: building._id, note: 'ai đó đậu vào chỗ tôi',
    });
    expect(res.item.type).toBe('slot_occupied');
    expect(res.item.status).toBe('open');
  });

  test('ViolationType bị deactivate (isActive=false) → không còn là type hợp lệ', async () => {
    await ViolationType.findOneAndUpdate({ building: building._id, code: 'slot_occupied' }, { isActive: false });
    await expect(
      userIncidentSvc.createIncident(reporter._id, {
        type: 'slot_occupied', buildingId: building._id,
      }),
    ).rejects.toMatchObject({ errorCode: 'INVALID_INCIDENT_TYPE' });
  });

  test("loại sự cố tự thân cố định (vd 'vehicle_damaged') vẫn hợp lệ dù không có trong bảng giá", async () => {
    const res = await userIncidentSvc.createIncident(reporter._id, {
      type: 'vehicle_damaged', buildingId: building._id, note: 'xe bị trầy khi đậu',
    });
    expect(res.item.type).toBe('vehicle_damaged');
  });

  test("type='other' luôn hợp lệ", async () => {
    const res = await userIncidentSvc.createIncident(reporter._id, {
      type: 'other', buildingId: building._id, note: 'trường hợp khác',
    });
    expect(res.item.type).toBe('other');
  });
});
