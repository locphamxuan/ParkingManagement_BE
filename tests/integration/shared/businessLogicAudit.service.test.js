const mongoose = require('mongoose');
const db = require('../../helpers/db');
const f = require('../../helpers/fixtures');
const {
  Feedback,
  LongTermSubscription,
  ParkingSession,
  Payment,
  StaffShift,
  User,
  VehicleType,
} = require('../../../src/models');
const {
  auditBusinessLogicInvariants,
  applyUniqueIndexes,
} = require('../../../src/services/shared/businessLogicAudit.service');

// Các test dựng dữ liệu BẨN phải bỏ unique index trước khi chèn. `db.clear()` chỉ xoá
// document nên index đã drop sẽ không tự quay lại → dựng lại sau mỗi test để test sau
// không chạy trên schema thiếu index. Chạy SAU clear (collection rỗng) nên luôn thành công.
const INDEXED_MODELS = [Payment, ParkingSession, Feedback, User];

const indexNames = async (model) => (await model.collection.indexes()).map((index) => index.name);

beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });
afterEach(async () => {
  await db.clear();
  await Promise.all(INDEXED_MODELS.map((model) => model.createIndexes()));
});

test('clean dataset reports zero conflicts', async () => {
  const report = await auditBusinessLogicInvariants();

  expect(Object.values(report.categories).every((item) => item.total === 0)).toBe(true);
});

test('dirty and ambiguous dataset reports categories with sample IDs', async () => {
  const building = await f.createBuilding();
  const otherBuilding = await f.createBuilding();
  const vehicleType = await f.createVehicleType(building._id);
  const floor = await f.createFloor(building._id);
  const slot = await f.createSlot(building._id, floor._id, { status: 'reserved' });
  const inactiveReservedSlot = await f.createSlot(building._id, floor._id, { status: 'reserved' });
  const availableSlot = await f.createSlot(building._id, floor._id, { status: 'available' });
  const pkg = await f.createPackage(building._id, vehicleType._id);
  const owner = await f.createUser({
    licensePlates: [{ plateNumber: '51F-111.11', vehicleType: 'car' }],
  });
  const now = Date.now();

  await LongTermSubscription.create([
    {
      user: owner._id,
      package: pkg._id,
      building: building._id,
      plateNumber: '51F-111.11',
      slot: slot._id,
      startDate: new Date(now - 60_000),
      endDate: new Date(now + 86_400_000),
      status: 'active',
    },
    {
      user: owner._id,
      package: pkg._id,
      building: building._id,
      plateNumber: '51F-222.22',
      slot: slot._id,
      startDate: new Date(now - 60_000),
      endDate: new Date(now + 86_400_000),
      status: 'active',
    },
  ]);
  await LongTermSubscription.create({
    user: owner._id,
    package: pkg._id,
    building: building._id,
    plateNumber: '51F-333.33',
    slot: inactiveReservedSlot._id,
    startDate: new Date(now - 86_400_000),
    endDate: new Date(now - 60_000),
    status: 'expired',
  });
  // Gói mồ côi: user đã bị xóa → phải được phân loại khác với "biển rời account".
  await LongTermSubscription.create({
    user: new mongoose.Types.ObjectId(),
    package: pkg._id,
    building: building._id,
    plateNumber: '51F-555.55',
    startDate: new Date(now - 60_000),
    endDate: new Date(now + 86_400_000),
    status: 'active',
  });
  const parkingSession = await ParkingSession.create({
    building: building._id,
    plateNumber: '51F-444.44',
    slot: availableSlot._id,
    status: 'active',
    paymentMethod: 'long_term',
  });
  await Payment.init();
  // Dựng lại DỮ LIỆU CŨ BẨN (2 intent PayOS sống trên cùng 1 phiên) đúng như trước khi
  // có các unique index — phải bỏ index mới thì mới chèn được, đó là lý do cần script
  // preflight trước khi bật index trên dữ liệu thật.
  await Payment.collection.dropIndex('uniq_payos_order_code');
  await Payment.collection.dropIndex('uniq_live_payos_session_intent');
  await Payment.collection.insertMany([
    {
      type: 'session',
      method: 'payos',
      amount: 10000,
      status: 'pending',
      parkingSession: parkingSession._id,
      payosOrderCode: 990001,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      type: 'session',
      method: 'payos',
      amount: 10000,
      status: 'pending',
      parkingSession: parkingSession._id,
      payosOrderCode: 990001,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);
  const staff = await f.createUser({ role: 'staff' });
  const crossBuildingShift = await f.createShift(otherBuilding._id);
  await StaffShift.create({
    building: building._id,
    staff: staff._id,
    shift: crossBuildingShift._id,
    workDate: new Date(),
    status: 'active',
  });

  const report = await auditBusinessLogicInvariants();

  expect(report.categories.duplicateActiveFixedSlot.total).toBe(1);
  expect(report.categories.inactiveSubscriptionWithReservedSlot.total).toBe(1);
  expect(report.categories.activeLongTermSessionSlotNotOccupied.total).toBe(1);
  expect(report.categories.duplicatePayosOrderCode.total).toBe(1);
  expect(report.categories.multiplePendingSessionPayments.total).toBe(1);
  expect(report.categories.subscriptionPlateMissingFromOwner.total).toBe(2);
  expect(report.categories.invalidStaffShiftReference.total).toBe(1);
  expect(report.categories.duplicateActiveFixedSlot.sampleIds).toHaveLength(1);

  // Mỗi dòng phải nêu rõ cách xử lý: gói mồ côi vs biển rời account.
  const ownerMismatch = report.categories.subscriptionPlateMissingFromOwner.details;
  expect(ownerMismatch.filter((row) => row.reason === 'owner_user_missing')).toHaveLength(1);
  expect(ownerMismatch.filter((row) => row.reason === 'plate_not_in_owner_account')).toHaveLength(1);
  expect(ownerMismatch.every((row) => row.plateNumber && row.subscriptionId)).toBe(true);

  await expect(applyUniqueIndexes(report)).rejects.toMatchObject({
    code: 'AUDIT_CONFLICTS_PRESENT',
  });
});

// ─── Preflight cho 4 unique index MỚI ────────────────────────────────────────
// Mỗi nhóm dưới đây là dữ liệu cũ có thật sẽ làm `createIndex` thất bại trên DB
// production. Dry-run phải chỉ ra ĐÚNG bản ghi nào chặn, trước khi bật index.

describe('preflight for the new business-invariant indexes', () => {
  test('duplicate active sessions for one plate in one building are reported', async () => {
    const building = await f.createBuilding();
    await ParkingSession.collection.dropIndex('uniq_active_session_per_plate_building');
    await ParkingSession.collection.insertMany([
      { building: building._id, plateNumber: '51F-777.77', status: 'active', entryTime: new Date() },
      { building: building._id, plateNumber: '51F-777.77', status: 'active', entryTime: new Date() },
    ]);

    const report = await auditBusinessLogicInvariants();
    const found = report.categories.duplicateActiveSessionPerPlateBuilding;

    expect(found.total).toBe(1);
    expect(found.sampleIds).toEqual([`${building._id}|51F-777.77`]);
    expect(found.details[0]).toMatchObject({
      buildingId: `${building._id}`,
      plateNumber: '51F-777.77',
    });
    expect(found.details[0].sessionIds).toHaveLength(2);
  });

  test('two live PayOS intents on one session are reported with their statuses', async () => {
    const building = await f.createBuilding();
    const parkingSession = await ParkingSession.create({
      building: building._id, plateNumber: '51F-888.88', status: 'active', entryTime: new Date(),
    });
    await Payment.collection.dropIndex('uniq_live_payos_session_intent');
    await Payment.collection.insertMany([
      { type: 'session', method: 'payos', amount: 10000, status: 'pending', parkingSession: parkingSession._id, payosOrderCode: 991001 },
      { type: 'session', method: 'payos', amount: 10000, status: 'success', parkingSession: parkingSession._id, payosOrderCode: 991002 },
    ]);

    const report = await auditBusinessLogicInvariants();
    const found = report.categories.multipleLivePayosSessionIntents;

    expect(found.total).toBe(1);
    expect(found.sampleIds).toEqual([`${parkingSession._id}`]);
    expect(found.details[0].paymentIds).toHaveLength(2);
    expect(found.details[0].statuses.sort()).toEqual(['pending', 'success']);
    // Bản ghi 'failed' không nằm trong index nên KHÔNG được tính là xung đột.
    expect(report.categories.multiplePendingSessionPayments.total).toBe(0);
  });

  test('live PayOS intents without a parking session are reported because they share the null index key', async () => {
    await Payment.collection.dropIndex('uniq_live_payos_session_intent');
    await Payment.collection.insertMany([
      { type: 'session', method: 'payos', amount: 10000, status: 'pending', parkingSession: null, payosOrderCode: 991003 },
      { type: 'session', method: 'payos', amount: 10000, status: 'success', parkingSession: null, payosOrderCode: 991004 },
    ]);

    const report = await auditBusinessLogicInvariants();
    const found = report.categories.multipleLivePayosSessionIntents;

    expect(found.total).toBe(1);
    expect(found.sampleIds).toEqual(['null']);
    expect(found.details[0]).toMatchObject({ parkingSessionId: 'null', statuses: expect.arrayContaining(['pending', 'success']) });
    await expect(applyUniqueIndexes(report)).rejects.toMatchObject({ code: 'AUDIT_CONFLICTS_PRESENT' });
  });

  test('two reviews by one user for one session are reported', async () => {
    const building = await f.createBuilding();
    const user = await f.createUser();
    const parkingSession = await ParkingSession.create({
      building: building._id, plateNumber: '51F-999.99', status: 'completed',
      entryTime: new Date(Date.now() - 3600_000), exitTime: new Date(),
    });
    await Feedback.collection.dropIndex('uniq_feedback_per_user_session');
    await Feedback.collection.insertMany([
      { user: user._id, parkingSession: parkingSession._id, building: building._id, rating: 5, comment: 'a', status: 'pending' },
      { user: user._id, parkingSession: parkingSession._id, building: building._id, rating: 1, comment: 'b', status: 'pending' },
    ]);

    const report = await auditBusinessLogicInvariants();
    const found = report.categories.duplicateFeedbackPerUserSession;

    expect(found.total).toBe(1);
    expect(found.sampleIds).toEqual([`${user._id}|${parkingSession._id}`]);
    expect(found.details[0].feedbackIds).toHaveLength(2);
  });

  test('feedback rows missing both unique-key fields are reported before index creation', async () => {
    await Feedback.collection.dropIndex('uniq_feedback_per_user_session');
    await Feedback.collection.insertMany([
      { building: new mongoose.Types.ObjectId(), rating: 5, comment: 'legacy a', status: 'pending' },
      { building: new mongoose.Types.ObjectId(), rating: 4, comment: 'legacy b', status: 'pending' },
    ]);

    const report = await auditBusinessLogicInvariants();
    const found = report.categories.duplicateFeedbackPerUserSession;

    expect(found.total).toBe(1);
    expect(found.sampleIds).toEqual(['null|null']);
    expect(found.details[0]).toMatchObject({ userId: 'null', parkingSessionId: 'null' });
    await expect(applyUniqueIndexes(report)).rejects.toMatchObject({ code: 'AUDIT_CONFLICTS_PRESENT' });
  });

  test('a plate held by two accounts and a plate duplicated inside one account are reported separately', async () => {
    await User.collection.dropIndex('uniq_license_plate_owner');
    const first = await f.createUser({ licensePlates: [{ plateNumber: '51F-100.00', vehicleType: 'car' }] });
    const second = await f.createUser();
    await User.collection.updateOne(
      { _id: second._id },
      { $set: { licensePlates: [{ plateNumber: '51F-100.00', vehicleType: 'car' }] } },
    );
    const hoarder = await f.createUser();
    await User.collection.updateOne(
      { _id: hoarder._id },
      {
        $set: {
          licensePlates: [
            { plateNumber: '51F-200.00', vehicleType: 'car' },
            { plateNumber: '51F-200.00', vehicleType: 'car' },
          ],
        },
      },
    );

    const report = await auditBusinessLogicInvariants();
    const found = report.categories.licensePlateOwnedByMultipleAccounts;

    expect(found.total).toBe(2);
    const crossAccount = found.details.find((row) => row.plateNumber === '51F-100.00');
    expect(crossAccount.reason).toBe('cross_account');
    expect(crossAccount.ownerIds.sort()).toEqual([`${first._id}`, `${second._id}`].sort());
    const withinAccount = found.details.find((row) => row.plateNumber === '51F-200.00');
    expect(withinAccount).toMatchObject({ reason: 'within_account', occurrences: 2 });
    expect(withinAccount.ownerIds).toEqual([`${hoarder._id}`]);
  });

  test('an unmapped vehicle class is reported but never blocks index creation', async () => {
    const building = await f.createBuilding();
    await f.createVehicleType(building._id, { code: 'UNMAPPED', vehicleClass: null });
    await VehicleType.collection.insertOne({
      building: building._id, code: 'BOGUS', name: 'Bogus', vehicleClass: 'spaceship', isActive: true,
    });

    const report = await auditBusinessLogicInvariants();
    const found = report.categories.vehicleTypeMissingVehicleClass;

    expect(found.total).toBe(2);
    expect(found.details.map((row) => row.code).sort()).toEqual(['BOGUS', 'UNMAPPED']);
    expect(found.details.every((row) => row.reason === 'manager_must_map_vehicle_class')).toBe(true);

    // Không nằm trong danh sách chặn → vẫn tạo được index.
    await expect(applyUniqueIndexes(report)).resolves.toEqual(expect.arrayContaining([
      'uniq_live_payos_session_intent',
    ]));
  });

  test.each([
    ['duplicateActiveSessionPerPlateBuilding', async (building) => {
      await ParkingSession.collection.dropIndex('uniq_active_session_per_plate_building');
      await ParkingSession.collection.insertMany([
        { building: building._id, plateNumber: '51F-321.32', status: 'active', entryTime: new Date() },
        { building: building._id, plateNumber: '51F-321.32', status: 'active', entryTime: new Date() },
      ]);
      return { model: ParkingSession, index: 'uniq_active_session_per_plate_building' };
    }],
    ['duplicateFeedbackPerUserSession', async (building) => {
      const user = await f.createUser();
      const parkingSession = await ParkingSession.create({
        building: building._id, plateNumber: '51F-654.65', status: 'completed', entryTime: new Date(),
      });
      await Feedback.collection.dropIndex('uniq_feedback_per_user_session');
      await Feedback.collection.insertMany([
        { user: user._id, parkingSession: parkingSession._id, rating: 5, comment: 'a', status: 'pending' },
        { user: user._id, parkingSession: parkingSession._id, rating: 4, comment: 'b', status: 'pending' },
      ]);
      return { model: Feedback, index: 'uniq_feedback_per_user_session' };
    }],
  ])('%s blocks --apply-indexes and creates nothing', async (categoryName, seed) => {
    const building = await f.createBuilding();
    const { model, index } = await seed(building);

    const report = await auditBusinessLogicInvariants();
    expect(report.categories[categoryName].total).toBeGreaterThan(0);

    await expect(applyUniqueIndexes(report)).rejects.toMatchObject({
      code: 'AUDIT_CONFLICTS_PRESENT',
    });
    // Gate phải chặn TRƯỚC khi tạo bất kỳ index nào — index vừa drop vẫn phải vắng mặt.
    expect(await indexNames(model)).not.toContain(index);
  });

  test('a clean dataset creates all four indexes and rerunning changes nothing', async () => {
    await Payment.collection.dropIndex('uniq_live_payos_session_intent');
    await ParkingSession.collection.dropIndex('uniq_active_session_per_plate_building');
    await Feedback.collection.dropIndex('uniq_feedback_per_user_session');
    await User.collection.dropIndex('uniq_license_plate_owner');

    const report = await auditBusinessLogicInvariants();
    const created = await applyUniqueIndexes(report);

    expect(created).toEqual(expect.arrayContaining([
      'uniq_live_payos_session_intent',
      'uniq_active_session_per_plate_building',
      'uniq_feedback_per_user_session',
      'uniq_license_plate_owner',
    ]));
    expect(await indexNames(Payment)).toEqual(expect.arrayContaining(['uniq_live_payos_session_intent']));
    expect(await indexNames(ParkingSession)).toEqual(expect.arrayContaining(['uniq_active_session_per_plate_building']));
    expect(await indexNames(Feedback)).toEqual(expect.arrayContaining(['uniq_feedback_per_user_session']));
    expect(await indexNames(User)).toEqual(expect.arrayContaining(['uniq_license_plate_owner']));

    // Idempotent: chạy lại không ném lỗi và không đổi tập index.
    const before = await Promise.all(INDEXED_MODELS.map(indexNames));
    await expect(applyUniqueIndexes(await auditBusinessLogicInvariants())).resolves.toBeDefined();
    const after = await Promise.all(INDEXED_MODELS.map(indexNames));
    expect(after.map((names) => names.sort())).toEqual(before.map((names) => names.sort()));
  });
});
