const mongoose = require('mongoose');
const db = require('../../helpers/db');
const f = require('../../helpers/fixtures');
const {
  LongTermSubscription,
  ParkingSession,
  Payment,
  StaffShift,
} = require('../../../src/models');
const {
  auditBusinessLogicInvariants,
  applyUniqueIndexes,
} = require('../../../src/services/shared/businessLogicAudit.service');

beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });
afterEach(async () => { await db.clear(); });

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
  const availableSlot = await f.createSlot(building._id, floor._id, { status: 'available' });
  const pkg = await f.createPackage(building._id, vehicleType._id);
  const owner = await f.createUser({
    vehicles: [{ plateNumber: '51F-111.11', category: 'car' }],
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
    slot: slot._id,
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
  await Payment.collection.dropIndex('uniq_payos_order_code');
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
  expect(report.categories.subscriptionPlateMissingFromOwner.total).toBe(3);
  expect(report.categories.invalidStaffShiftReference.total).toBe(1);
  expect(report.categories.duplicateActiveFixedSlot.sampleIds).toHaveLength(1);

  // Mỗi dòng phải nêu rõ cách xử lý: gói mồ côi vs biển rời account.
  const ownerMismatch = report.categories.subscriptionPlateMissingFromOwner.details;
  expect(ownerMismatch.filter((row) => row.reason === 'owner_user_missing')).toHaveLength(1);
  expect(ownerMismatch.filter((row) => row.reason === 'plate_not_in_owner_account')).toHaveLength(2);
  expect(ownerMismatch.every((row) => row.plateNumber && row.subscriptionId)).toBe(true);

  await expect(applyUniqueIndexes(report)).rejects.toMatchObject({
    code: 'AUDIT_CONFLICTS_PRESENT',
  });
});
