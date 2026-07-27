const {
  LongTermSubscription,
  ParkingSession,
  ParkingSlot,
  Payment,
  StaffShift,
  User,
} = require('../../models');

const SAMPLE_LIMIT = 20;
const plateCore = (value) => `${value || ''}`.toUpperCase().replace(/[^A-Z0-9]/g, '');
const sampleIds = (rows) => rows.slice(0, SAMPLE_LIMIT).map((row) => `${row._id}`);
const category = (rows, details = []) => ({
  total: rows.length,
  sampleIds: sampleIds(rows),
  details: details.slice(0, SAMPLE_LIMIT),
});

const auditBusinessLogicInvariants = async () => {
  const [
    duplicateFixedSlots,
    inactiveFixedSubscriptions,
    activeFixedSubscriptions,
    activeLongTermSessions,
    duplicateOrderCodes,
    duplicatePendingSessionPayments,
    subscriptions,
    staffShifts,
  ] = await Promise.all([
    LongTermSubscription.aggregate([
      { $match: { status: 'active', slot: { $type: 'objectId' } } },
      { $group: { _id: '$slot', count: { $sum: 1 }, subscriptions: { $push: '$_id' } } },
      { $match: { count: { $gt: 1 } } },
    ]),
    LongTermSubscription.find({
      status: { $in: ['expired', 'cancelled'] },
      slot: { $ne: null },
    }).select('_id slot status').lean(),
    LongTermSubscription.find({
      status: 'active',
      slot: { $ne: null },
    }).select('_id slot').lean(),
    ParkingSession.find({
      status: 'active',
      paymentMethod: 'long_term',
      slot: { $ne: null },
    }).select('_id slot').lean(),
    Payment.aggregate([
      { $match: { payosOrderCode: { $type: 'number' } } },
      { $group: { _id: '$payosOrderCode', count: { $sum: 1 }, payments: { $push: '$_id' } } },
      { $match: { count: { $gt: 1 } } },
    ]),
    Payment.aggregate([
      {
        $match: {
          type: 'session',
          method: 'payos',
          status: 'pending',
          parkingSession: { $type: 'objectId' },
        },
      },
      { $group: { _id: '$parkingSession', count: { $sum: 1 }, payments: { $push: '$_id' } } },
      { $match: { count: { $gt: 1 } } },
    ]),
    LongTermSubscription.find({ user: { $ne: null } })
      .select('_id user plateNumber')
      .lean(),
    StaffShift.find({})
      .select('_id building shift staff')
      .populate('shift', 'building')
      .populate('staff', 'role isActive')
      .lean(),
  ]);

  const slotIds = [
    ...inactiveFixedSubscriptions,
    ...activeFixedSubscriptions,
    ...activeLongTermSessions,
  ].map((row) => row.slot);
  const slots = await ParkingSlot.find({ _id: { $in: slotIds } })
    .select('_id status')
    .lean();
  const slotStatus = new Map(slots.map((slot) => [`${slot._id}`, slot.status]));

  const inactiveReserved = inactiveFixedSubscriptions.filter(
    (subscription) => slotStatus.get(`${subscription.slot}`) === 'reserved',
  );
  const activeAvailable = activeFixedSubscriptions.filter(
    (subscription) => slotStatus.get(`${subscription.slot}`) === 'available',
  );
  const activeSessionSlotMismatch = activeLongTermSessions.filter(
    (parkingSession) => slotStatus.get(`${parkingSession.slot}`) !== 'occupied',
  );

  const userIds = [...new Set(subscriptions.map((subscription) => `${subscription.user}`))];
  const owners = await User.find({ _id: { $in: userIds } })
    .select('_id licensePlates.plateNumber')
    .lean();
  const platesByOwner = new Map(owners.map((owner) => [
    `${owner._id}`,
    new Set((owner.licensePlates || []).map((plate) => plateCore(plate.plateNumber))),
  ]));
  const subscriptionOwnerMismatch = subscriptions.filter((subscription) => (
    !platesByOwner.get(`${subscription.user}`)?.has(plateCore(subscription.plateNumber))
  ));
  // Phân loại để người vận hành biết cách xử lý: gói mồ côi (user đã bị xóa) phải
  // cancel + nhả slot, còn gói còn chủ thì thêm biển vào đúng account. Tool không
  // tự đoán chủ sở hữu trong cả hai trường hợp.
  const subscriptionOwnerMismatchDetails = subscriptionOwnerMismatch.map((subscription) => ({
    subscriptionId: `${subscription._id}`,
    plateNumber: subscription.plateNumber,
    userId: `${subscription.user}`,
    reason: platesByOwner.has(`${subscription.user}`)
      ? 'plate_not_in_owner_account'
      : 'owner_user_missing',
  }));

  const invalidStaffShifts = staffShifts.filter((assignment) => (
    !assignment.shift ||
    `${assignment.shift.building}` !== `${assignment.building}` ||
    !assignment.staff ||
    assignment.staff.role !== 'staff' ||
    assignment.staff.isActive === false
  ));

  return {
    generatedAt: new Date().toISOString(),
    mode: 'dry-run',
    categories: {
      duplicateActiveFixedSlot: category(
        duplicateFixedSlots,
        duplicateFixedSlots.map((row) => ({
          slotId: `${row._id}`,
          subscriptionIds: row.subscriptions.map(String),
        })),
      ),
      inactiveSubscriptionWithReservedSlot: category(inactiveReserved),
      activeFixedSubscriptionWithAvailableSlot: category(activeAvailable),
      activeLongTermSessionSlotNotOccupied: category(activeSessionSlotMismatch),
      duplicatePayosOrderCode: category(
        duplicateOrderCodes,
        duplicateOrderCodes.map((row) => ({
          orderCode: row._id,
          paymentIds: row.payments.map(String),
        })),
      ),
      multiplePendingSessionPayments: category(
        duplicatePendingSessionPayments,
        duplicatePendingSessionPayments.map((row) => ({
          parkingSessionId: `${row._id}`,
          paymentIds: row.payments.map(String),
        })),
      ),
      subscriptionPlateMissingFromOwner: category(
        subscriptionOwnerMismatch,
        subscriptionOwnerMismatchDetails,
      ),
      invalidStaffShiftReference: category(invalidStaffShifts),
    },
  };
};

const applyUniqueIndexes = async (report) => {
  const blockers = [
    'duplicateActiveFixedSlot',
    'duplicatePayosOrderCode',
    'multiplePendingSessionPayments',
  ].filter((name) => report.categories[name].total > 0);
  if (blockers.length) {
    const error = new Error(`Refusing index migration; unresolved categories: ${blockers.join(', ')}`);
    error.code = 'AUDIT_CONFLICTS_PRESENT';
    throw error;
  }

  const created = [];
  created.push(await LongTermSubscription.collection.createIndex(
    { slot: 1 },
    {
      unique: true,
      name: 'uniq_active_fixed_slot',
      partialFilterExpression: {
        status: 'active',
        slot: { $type: 'objectId' },
      },
    },
  ));
  created.push(await Payment.collection.createIndex(
    { payosOrderCode: 1 },
    {
      unique: true,
      name: 'uniq_payos_order_code',
      partialFilterExpression: { payosOrderCode: { $type: 'number' } },
    },
  ));
  created.push(await Payment.collection.createIndex(
    { parkingSession: 1, method: 1 },
    {
      unique: true,
      name: 'uniq_pending_payos_session',
      partialFilterExpression: {
        type: 'session',
        method: 'payos',
        status: 'pending',
        parkingSession: { $type: 'objectId' },
      },
    },
  ));
  return created;
};

module.exports = { auditBusinessLogicInvariants, applyUniqueIndexes };
