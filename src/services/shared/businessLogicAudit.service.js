const {
  Feedback,
  LongTermSubscription,
  ParkingSession,
  ParkingSlot,
  Payment,
  StaffShift,
  User,
  Vehicle,
  VehicleType,
} = require('../../models');
// Cùng một hàm chuẩn hoá "lõi biển số" với unique index của Vehicle — chép lại ở đây
// sẽ khiến audit và DB hiểu khác nhau về "hai biển này là một".
const { plateCoreOf } = require('../../models/vehicle/Vehicle');
const { VEHICLE_CATEGORY_CODES } = require('../../constants/vehicle');

const SAMPLE_LIMIT = 20;
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
    // Ownership must be valid for an entitlement that can still be used.
    // Cancelled/expired subscriptions are immutable financial history and may
    // legitimately outlive a deleted account.
    LongTermSubscription.find({ status: 'active', user: { $ne: null } })
      .select('_id user plateNumber status')
      .lean(),
    StaffShift.find({})
      .select('_id building shift staff')
      .populate('shift', 'building')
      .populate('staff', 'role isActive')
      .lean(),
  ]);

  // ── Bản ghi chặn 4 unique index MỚI (xem src/models/*) ─────────────────────
  // Mỗi truy vấn dưới đây CHỈ ĐỌC. `_id` của nhóm được ép thành chuỗi đọc được để
  // `sampleIds` (dùng chung với các category cũ) vẫn có ý nghĩa với khoá ghép.
  const [
    duplicateActiveSessions,
    duplicateLivePayosIntents,
    duplicateFeedbacks,
    plateOwnershipRows,
    unmappedVehicleTypes,
  ] = await Promise.all([
    // uniq_active_session_per_plate_building — {building, plateNumber} khi status='active'
    ParkingSession.aggregate([
      { $match: { status: 'active' } },
      {
        $group: {
          _id: { $concat: [{ $toString: '$building' }, '|', '$plateNumber'] },
          count: { $sum: 1 },
          sessions: { $push: '$_id' },
          building: { $first: '$building' },
          plateNumber: { $first: '$plateNumber' },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ]),
    // uniq_live_payos_session_intent — {parkingSession} khi type/method/status còn sống
    Payment.aggregate([
      {
        $match: {
          type: 'session',
          method: 'payos',
          status: { $in: ['pending', 'success'] },
        },
      },
      {
        $group: {
          // The partial unique index also indexes null/missing parkingSession as
          // the same null key, so preflight must not discard malformed legacy rows.
          _id: { $ifNull: ['$parkingSession', null] },
          count: { $sum: 1 },
          payments: { $push: '$_id' },
          statuses: { $push: '$status' },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ]),
    // uniq_feedback_per_user_session — {user, parkingSession}
    Feedback.aggregate([
      {
        $group: {
          // A non-partial unique index treats missing values as null keys. Keep
          // malformed legacy rows in the audit so they cannot surprise createIndex.
          _id: {
            user: { $ifNull: ['$user', null] },
            parkingSession: { $ifNull: ['$parkingSession', null] },
          },
          count: { $sum: 1 },
          feedbacks: { $push: '$_id' },
        },
      },
      {
        $project: {
          _id: {
            $concat: [
              { $ifNull: [{ $toString: '$_id.user' }, 'null'] },
              '|',
              { $ifNull: [{ $toString: '$_id.parkingSession' }, 'null'] },
            ],
          },
          count: 1,
          feedbacks: 1,
          user: '$_id.user',
          parkingSession: '$_id.parkingSession',
        },
      },
      { $match: { count: { $gt: 1 } } },
    ]),
    // uniq_license_plate_owner — multikey unique trên chuỗi biển số THÔ.
    // Gom theo đúng giá trị index dùng (không normalize) và đếm cả số chủ sở hữu
    // riêng biệt lẫn tổng số lần xuất hiện, để phân biệt 2 loại xung đột.
    User.aggregate([
      { $match: { 'licensePlates.plateNumber': { $exists: true } } },
      { $unwind: '$licensePlates' },
      { $match: { 'licensePlates.plateNumber': { $type: 'string' } } },
      {
        $group: {
          _id: '$licensePlates.plateNumber',
          occurrences: { $sum: 1 },
          owners: { $addToSet: '$_id' },
        },
      },
      { $match: { $expr: { $gt: ['$occurrences', 1] } } },
    ]),
    // Báo cáo-only: VehicleType chưa map sang canonical class (chặn defect B, KHÔNG
    // chặn tạo index). `$nin` cũng khớp document thiếu hẳn field.
    VehicleType.find({ category: { $nin: VEHICLE_CATEGORY_CODES } })
      .select('_id building code name category')
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
    // A historical cancelled/expired subscription can retain its original
    // fixed-slot reference. That is valid when a newer active subscription
    // now owns the same reserved slot. Report only slots that are reserved
    // without an active subscription holding them.
    (subscription) => (
      slotStatus.get(`${subscription.slot}`) === 'reserved' &&
      !activeFixedSubscriptions.some((active) => `${active.slot}` === `${subscription.slot}`)
    ),
  );
  const activeAvailable = activeFixedSubscriptions.filter(
    (subscription) => slotStatus.get(`${subscription.slot}`) === 'available',
  );
  const activeSessionSlotMismatch = activeLongTermSessions.filter(
    (parkingSession) => slotStatus.get(`${parkingSession.slot}`) !== 'occupied',
  );

  const userIds = [...new Set(subscriptions.map((subscription) => `${subscription.user}`))];
  const [owners, ownedVehicles] = await Promise.all([
    User.find({ _id: { $in: userIds } }).select('_id').lean(),
    Vehicle.find({ owner: { $in: userIds } }).select('owner plateCore').lean(),
  ]);
  // Chủ xe còn tồn tại nhưng chưa có xe nào vẫn phải có entry rỗng — nhờ đó phân biệt
  // được "gói mồ côi vì user đã bị xoá" với "user còn nhưng không còn giữ biển đó".
  const platesByOwner = new Map(owners.map((owner) => [`${owner._id}`, new Set()]));
  ownedVehicles.forEach((vehicle) => {
    platesByOwner.get(`${vehicle.owner}`)?.add(vehicle.plateCore);
  });
  const subscriptionOwnerMismatch = subscriptions.filter((subscription) => (
    !platesByOwner.get(`${subscription.user}`)?.has(plateCoreOf(subscription.plateNumber))
  ));
  // Phân loại để người vận hành biết cách xử lý: gói mồ côi (user đã bị xóa) phải
  // cancel + nhả slot, còn gói còn chủ thì thêm biển vào đúng account. Tool không
  // tự đoán chủ sở hữu trong cả hai trường hợp.
  const subscriptionOwnerMismatchDetails = subscriptionOwnerMismatch.map((subscription) => ({
    subscriptionId: `${subscription._id}`,
    plateNumber: subscription.plateNumber,
    userId: `${subscription.user}`,
    status: subscription.status,
    reason: platesByOwner.has(`${subscription.user}`)
      ? 'plate_not_in_owner_account'
      : 'owner_user_missing',
  }));

  // Hai kiểu xung đột biển số, tách bằng `reason` để người vận hành biết cách xử lý:
  //  - cross_account   : 2+ tài khoản cùng giữ 1 biển → PHẢI chọn chủ sở hữu đúng.
  //  - within_account  : 1 tài khoản có biển trùng trong mảng licensePlates.
  // Lưu ý: multikey unique index de-dup key theo từng document nên `within_account`
  // KHÔNG thực sự làm createIndex thất bại; vẫn xếp vào nhóm chặn (fail-closed) vì
  // đó là lỗi dữ liệu mà chính bất biến này nhắm tới.
  const plateOwnershipConflicts = plateOwnershipRows.map((row) => ({
    plateNumber: row._id,
    ownerIds: row.owners.map(String),
    occurrences: row.occurrences,
    reason: row.owners.length > 1 ? 'cross_account' : 'within_account',
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

      // ── Chặn 4 unique index mới ────────────────────────────────────────────
      duplicateActiveSessionPerPlateBuilding: category(
        duplicateActiveSessions,
        duplicateActiveSessions.map((row) => ({
          buildingId: `${row.building}`,
          plateNumber: row.plateNumber,
          sessionIds: row.sessions.map(String),
        })),
      ),
      multipleLivePayosSessionIntents: category(
        duplicateLivePayosIntents,
        duplicateLivePayosIntents.map((row) => ({
          parkingSessionId: `${row._id}`,
          paymentIds: row.payments.map(String),
          statuses: row.statuses,
        })),
      ),
      duplicateFeedbackPerUserSession: category(
        duplicateFeedbacks,
        duplicateFeedbacks.map((row) => ({
          userId: `${row.user}`,
          parkingSessionId: `${row.parkingSession}`,
          feedbackIds: row.feedbacks.map(String),
        })),
      ),
      licensePlateOwnedByMultipleAccounts: category(
        plateOwnershipRows,
        plateOwnershipConflicts,
      ),

      // ── Báo cáo-only (KHÔNG chặn tạo index) ────────────────────────────────
      vehicleTypeMissingVehicleClass: category(
        unmappedVehicleTypes,
        unmappedVehicleTypes.map((row) => ({
          vehicleTypeId: `${row._id}`,
          buildingId: `${row.building}`,
          code: row.code,
          name: row.name,
          category: row.category ?? null,
          reason: 'manager_must_map_vehicle_class',
        })),
      ),
    },
  };
};

const applyUniqueIndexes = async (report) => {
  const blockers = [
    'duplicateActiveFixedSlot',
    'duplicatePayosOrderCode',
    'multiplePendingSessionPayments',
    // 4 bất biến mới — `vehicleTypeMissingVehicleClass` CỐ Ý không nằm ở đây:
    // nó chỉ báo cáo cho manager map loại xe, không cản trở việc tạo index.
    'duplicateActiveSessionPerPlateBuilding',
    'multipleLivePayosSessionIntents',
    'duplicateFeedbackPerUserSession',
    'licensePlateOwnedByMultipleAccounts',
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

  // ── 4 bất biến mới. Spec phải TRÙNG KHỚP khai báo trong schema, nếu lệch thì
  // mongoose/driver sẽ coi là index khác và tạo thêm bản trùng lặp. ────────────
  // src/models/finance/Payment.js
  created.push(await Payment.collection.createIndex(
    { parkingSession: 1 },
    {
      unique: true,
      name: 'uniq_live_payos_session_intent',
      partialFilterExpression: {
        type: 'session',
        method: 'payos',
        status: { $in: ['pending', 'success'] },
      },
    },
  ));
  // src/models/operations/ParkingSession.js
  created.push(await ParkingSession.collection.createIndex(
    { building: 1, plateNumber: 1 },
    {
      unique: true,
      name: 'uniq_active_session_per_plate_building',
      partialFilterExpression: { status: 'active' },
    },
  ));
  // src/models/operations/Feedback.js
  created.push(await Feedback.collection.createIndex(
    { user: 1, parkingSession: 1 },
    { unique: true, name: 'uniq_feedback_per_user_session' },
  ));
  // src/models/user/User.js
  created.push(await User.collection.createIndex(
    { 'licensePlates.plateNumber': 1 },
    {
      unique: true,
      name: 'uniq_license_plate_owner',
      partialFilterExpression: { 'licensePlates.plateNumber': { $exists: true } },
    },
  ));
  return created;
};

module.exports = { auditBusinessLogicInvariants, applyUniqueIndexes };
