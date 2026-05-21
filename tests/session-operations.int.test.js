process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pbms-test';

const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const app = require('../src/app');
const { signToken } = require('../src/utils/token');
const User = require('../src/models/User');
const Building = require('../src/models/Building');
const BuildingManager = require('../src/models/BuildingManager');
const ParkingSession = require('../src/models/ParkingSession');
const ParkingSlot = require('../src/models/ParkingSlot');
const Reservation = require('../src/models/Reservation');
const LongTermSubscription = require('../src/models/LongTermSubscription');
const Payment = require('../src/models/Payment');
const WalletTransaction = require('../src/models/WalletTransaction');
const AuditLog = require('../src/models/AuditLog');

jest.setTimeout(120000);

let replSet;

const authHeader = (token) => ({ Authorization: `Bearer ${token}` });

const createBuilding = (overrides = {}) =>
  Building.create({
    name: overrides.name || 'Test Building',
    code: overrides.code || `BLD-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    address: { fullAddress: overrides.address || '1 Test Street' },
    totalFloors: overrides.totalFloors || 5,
    pricing: overrides.pricing || { hourlyRate: 10, dailyCap: 100 },
    status: overrides.status || 'active',
    isActive: true,
    location: { type: 'Point', coordinates: overrides.coordinates || [106.7, 10.78] },
  });

const createStaffContext = async ({ walletBalance = 100, assignedExtraBuilding = false } = {}) => {
  const building = await createBuilding({ code: 'BLD-PRIMARY', name: 'Primary Building' });
  const foreignBuilding = await createBuilding({ code: 'BLD-FOREIGN', name: 'Foreign Building' });
  const staff = await User.create({
    email: `staff-${Date.now()}@example.com`,
    password: 'password123',
    fullName: 'Test Staff',
    role: 'staff',
    walletBalance,
  });

  await BuildingManager.create({ building: building._id, user: staff._id, isActive: true });
  if (assignedExtraBuilding) {
    await BuildingManager.create({ building: foreignBuilding._id, user: staff._id, isActive: true });
  }

  const token = signToken(staff._id.toString());
  return { staff, token, building, foreignBuilding };
};

const seedActiveSession = async ({ building, staff, plateNumber, status = 'active', checkInAt, slot = null, sessionType = 'standard', fee = 0, extra = {} }) =>
  ParkingSession.create({
    plateNumber,
    vehicleType: extra.vehicleType || 'car',
    building: building._id,
    gate: extra.gate || 'G1',
    staff: staff._id,
    checkInAt: checkInAt || new Date(Date.now() - 60 * 60 * 1000),
    status,
    slot,
    sessionType,
    fee,
    ...extra,
  });

const seedReservation = async ({ building, plateNumber, slot, status = 'active', holdUntil, expiresAt }) =>
  Reservation.create({
    building: building._id,
    plateNumber,
    vehicleType: 'car',
    code: `RSV-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    slot: slot?._id || slot || null,
    status,
    holdUntil: holdUntil || new Date(Date.now() + 30 * 60 * 1000),
    expiresAt: expiresAt || new Date(Date.now() + 30 * 60 * 1000),
  });

const seedSubscription = async ({ building, staff, plateNumber, status = 'active', endAt }) =>
  LongTermSubscription.create({
    building: building._id,
    user: staff._id,
    plateNumber,
    packageName: 'monthly',
    status,
    startAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    endAt: endAt || new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
  });

const seedSlot = async ({ building, code, status = 'available' }) =>
  ParkingSlot.create({
    building: building._id,
    code,
    floor: '1',
    status,
  });

const expectAuditAction = async (action, buildingId) => {
  const log = await AuditLog.findOne({ action, building: buildingId }).sort({ createdAt: -1 });
  expect(log).toBeTruthy();
  return log;
};

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  await mongoose.connect(replSet.getUri(), { dbName: 'pbms_session_ops_test' });
});

afterEach(async () => {
  await mongoose.connection.db.dropDatabase();
});

afterAll(async () => {
  await mongoose.disconnect();
  if (replSet) {
    await replSet.stop();
  }
});

describe('POST /api/staff/parking-sessions/check-in', () => {
  it('TC01_Vao_HopLe - Xe vãng lai vào bãi bình thường', async () => {
    const { staff, token, building } = await createStaffContext();

    const res = await request(app)
      .post('/api/staff/parking-sessions/check-in')
      .set(authHeader(token))
      .send({ building: building._id.toString(), plateNumber: 'ABC123', vehicleType: 'car', gate: 'G1' });

    expect(res.status).toBe(200);
    // Expect the API to return a newly created active session for the valid staff-scoped building.
    expect(res.body.success).toBe(true);
    expect(res.body.data.plateNumber).toBe('ABC123');
    expect(res.body.data.status).toBe('active');

    const log = await expectAuditAction('PARKING_SESSION_CHECK_IN', building._id);
    // The audit log must preserve the actor and entity that changed state.
    expect(log.actor.toString()).toBe(staff._id.toString());
    expect(log.entityType).toBe('ParkingSession');
  });

  it('TC02_Vao_TrungBienSo_Chon - Duplicate active plate is blocked', async () => {
    const { token, staff, building } = await createStaffContext();
    await seedActiveSession({ building, staff, plateNumber: 'DUP111' });

    const res = await request(app)
      .post('/api/staff/parking-sessions/check-in')
      .set(authHeader(token))
      .send({ building: building._id.toString(), plateNumber: 'DUP111', vehicleType: 'car', gate: 'G1' });

    expect(res.status).toBe(400);
    // Expect the server to return the dedicated warning code so the UI can show a manual override flow.
    expect(res.body.errorCode).toBe('DUPLICATE_PLATE_WARNING');
    expect(await ParkingSession.countDocuments({ plateNumber: 'DUP111' })).toBe(1);
    expect(await AuditLog.countDocuments({ action: 'DUPLICATE_PLATE_BYPASS' })).toBe(0);
  });

  it('TC03_Vao_TrungBienSo_Bypass - Force check-in after manual verification', async () => {
    const { token, staff, building } = await createStaffContext();
    await seedActiveSession({ building, staff, plateNumber: 'DUP222' });

    const res = await request(app)
      .post('/api/staff/parking-sessions/check-in')
      .set(authHeader(token))
      .send({ building: building._id.toString(), plateNumber: 'DUP222', vehicleType: 'car', gate: 'G1', forceCheckIn: true });

    expect(res.status).toBe(200);
    // The bypass path must create a second session and keep a dedicated audit entry.
    expect(await ParkingSession.countDocuments({ plateNumber: 'DUP222' })).toBe(2);
    await expectAuditAction('DUPLICATE_PLATE_BYPASS', building._id);
  });

  it('TC04_Vao_GoiThang_ConHan - Long-term subscription active routes to special path', async () => {
    const { token, staff, building } = await createStaffContext();
    await seedSubscription({ building, staff, plateNumber: 'SUB123', status: 'active', endAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) });

    const res = await request(app)
      .post('/api/staff/parking-sessions/check-in')
      .set(authHeader(token))
      .send({ building: building._id.toString(), plateNumber: 'SUB123', vehicleType: 'car', gate: 'G1' });

    expect(res.status).toBe(200);
    // Expect long-term flow to waive the hourly fee and label the session accordingly.
    expect(res.body.data.sessionType).toBe('long_term');
    expect(res.body.data.fee).toBe(0);
    await expectAuditAction('LONG_TERM_SUBSCRIPTION_CHECK_IN', building._id);
  });

  it('TC05_Vao_GoiThang_HetHan - Expired subscription falls back to normal session', async () => {
    const { token, staff, building } = await createStaffContext();
    const subscription = await seedSubscription({ building, staff, plateNumber: 'SUBEX1', status: 'active', endAt: new Date(Date.now() - 60 * 60 * 1000) });

    const res = await request(app)
      .post('/api/staff/parking-sessions/check-in')
      .set(authHeader(token))
      .send({ building: building._id.toString(), plateNumber: 'SUBEX1', vehicleType: 'car', gate: 'G1' });

    expect(res.status).toBe(200);
    expect(res.body.data.sessionType).toBe('standard');
    const refreshed = await LongTermSubscription.findById(subscription._id);
    // The expired subscription should be auto-marked expired so later check-ins do not reuse it.
    expect(refreshed.status).toBe('expired');
  });

  it('TC06_Vao_DatCho_ConHan - Active reservation checks in and occupies slot', async () => {
    const { token, staff, building } = await createStaffContext();
    const slot = await seedSlot({ building, code: 'A-01', status: 'available' });
    const reservation = await seedReservation({ building, plateNumber: 'RSV111', slot, holdUntil: new Date(Date.now() + 15 * 60 * 1000) });

    const res = await request(app)
      .post('/api/staff/parking-sessions/check-in')
      .set(authHeader(token))
      .send({ building: building._id.toString(), plateNumber: 'RSV111', vehicleType: 'car', gate: 'G1' });

    expect(res.status).toBe(200);
    // Reservation path should bind the session to the reservation slot and mark both as used.
    expect(res.body.data.sessionType).toBe('reservation');
    expect(String(res.body.data.slot)).toBe(String(slot._id));
    const refreshedReservation = await Reservation.findById(reservation._id);
    const refreshedSlot = await ParkingSlot.findById(slot._id);
    expect(refreshedReservation.status).toBe('checked_in');
    expect(refreshedSlot.status).toBe('occupied');
    await expectAuditAction('RESERVATION_CHECK_IN', building._id);
  });

  it('TC07_Vao_DatCho_QuaHan - Expired reservation is released and treated as normal session', async () => {
    const { token, staff, building } = await createStaffContext();
    const slot = await seedSlot({ building, code: 'A-02', status: 'reserved' });
    const reservation = await seedReservation({ building, plateNumber: 'RSV222', slot, holdUntil: new Date(Date.now() - 15 * 60 * 1000), expiresAt: new Date(Date.now() - 15 * 60 * 1000) });

    const res = await request(app)
      .post('/api/staff/parking-sessions/check-in')
      .set(authHeader(token))
      .send({ building: building._id.toString(), plateNumber: 'RSV222', vehicleType: 'car', gate: 'G1' });

    expect(res.status).toBe(200);
    // The expired reservation must not block check-in and must be marked expired in DB.
    expect(res.body.data.sessionType).toBe('standard');
    const refreshedReservation = await Reservation.findById(reservation._id);
    expect(refreshedReservation.status).toBe('expired');
  });

  it('TC08_Vao_SlotBaoTri - Maintenance slot blocks check-in', async () => {
    const { token, staff, building } = await createStaffContext();
    const slot = await seedSlot({ building, code: 'M-01', status: 'maintenance' });
    await seedReservation({ building, plateNumber: 'MNT111', slot, holdUntil: new Date(Date.now() + 15 * 60 * 1000) });

    const res = await request(app)
      .post('/api/staff/parking-sessions/check-in')
      .set(authHeader(token))
      .send({ building: building._id.toString(), plateNumber: 'MNT111', vehicleType: 'car', gate: 'G1' });

    expect(res.status).toBe(409);
    expect(res.body.errorCode).toBe('SLOT_MAINTENANCE_NOT_AVAILABLE');
    expect(await ParkingSession.countDocuments({ plateNumber: 'MNT111' })).toBe(0);
  });
});

describe('PATCH /api/staff/parking-sessions/:id/check-out', () => {
  it('TC09_Ra_HopLe - Normal checkout closes session and records payment', async () => {
    const { token, staff, building } = await createStaffContext();
    const session = await seedActiveSession({ building, staff, plateNumber: 'OUT111', checkInAt: new Date(Date.now() - 2 * 60 * 60 * 1000) });

    const res = await request(app)
      .patch(`/api/staff/parking-sessions/${session._id}/check-out`)
      .set(authHeader(token))
      .send({ paymentMethod: 'cash' });

    expect(res.status).toBe(200);
    // The happy path must close the session and return a positive fee.
    expect(res.body.data.status).toBe('closed');
    expect(res.body.data.fee).toBeGreaterThan(0);
    await expectAuditAction('PARKING_SESSION_CHECK_OUT', building._id);
    expect(await Payment.countDocuments({ session: session._id })).toBe(1);
  });

  it('TC10_Ra_LechBienSo_Chon - Plate mismatch is blocked', async () => {
    const { token, staff, building } = await createStaffContext();
    const session = await seedActiveSession({ building, staff, plateNumber: 'MISMATCH1', checkInAt: new Date(Date.now() - 60 * 60 * 1000) });

    const res = await request(app)
      .patch(`/api/staff/parking-sessions/${session._id}/check-out`)
      .set(authHeader(token))
      .send({ plateNumber: 'DIFFERENT1', paymentMethod: 'cash' });

    expect(res.status).toBe(409);
    // The API should return a dedicated mismatch code so staff must confirm before proceeding.
    expect(res.body.errorCode).toBe('PLATE_MISMATCH_WARNING');
    const refreshed = await ParkingSession.findById(session._id);
    expect(refreshed.status).toBe('active');
  });

  it('TC11_Ra_LechBienSo_Bypass - Bypass mismatch after manual confirmation', async () => {
    const { token, staff, building } = await createStaffContext();
    const session = await seedActiveSession({ building, staff, plateNumber: 'MISMATCH2', checkInAt: new Date(Date.now() - 2 * 60 * 60 * 1000) });

    const res = await request(app)
      .patch(`/api/staff/parking-sessions/${session._id}/check-out`)
      .set(authHeader(token))
      .send({ plateNumber: 'DIFFERENT2', bypassMismatch: true, paymentMethod: 'cash' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('closed');
    await expectAuditAction('PLATE_MISMATCH_BYPASS', building._id);
  });

  it('TC12_Ra_SuaPhi_HopLe - Fee override requires adjustment reason', async () => {
    const { token, staff, building } = await createStaffContext();
    const session = await seedActiveSession({ building, staff, plateNumber: 'OVR111', checkInAt: new Date(Date.now() - 2 * 60 * 60 * 1000) });

    const res = await request(app)
      .patch(`/api/staff/parking-sessions/${session._id}/check-out`)
      .set(authHeader(token))
      .send({ adjustedFee: 50000, adjustmentReason: 'Barrier fault', paymentMethod: 'cash' });

    expect(res.status).toBe(200);
    // The adjusted fee must be persisted in payments and the audit trail must reflect the override.
    const payment = await Payment.findOne({ session: session._id });
    expect(payment.amount).toBe(50000);
    expect(payment.adjustmentReason).toBe('Barrier fault');
    await expectAuditAction('OVERRIDE_FEE_CALCULATION', building._id);
  });

  it('TC13_Ra_SuaPhi_ThieuLyDo - Missing adjustment reason is rejected', async () => {
    const { token, staff, building } = await createStaffContext();
    const session = await seedActiveSession({ building, staff, plateNumber: 'OVR222', checkInAt: new Date(Date.now() - 60 * 60 * 1000) });

    const res = await request(app)
      .patch(`/api/staff/parking-sessions/${session._id}/check-out`)
      .set(authHeader(token))
      .send({ adjustedFee: 50000, paymentMethod: 'cash' });

    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('ADJUSTMENT_REASON_REQUIRED');
    expect(await Payment.countDocuments({ session: session._id })).toBe(0);
  });

  it('TC14_Ra_ViHetTien - Wallet payment fails when balance is insufficient', async () => {
    const { token, staff, building } = await createStaffContext({ walletBalance: 0 });
    const session = await seedActiveSession({ building, staff, plateNumber: 'WAL111', checkInAt: new Date(Date.now() - 2 * 60 * 60 * 1000) });

    const res = await request(app)
      .patch(`/api/staff/parking-sessions/${session._id}/check-out`)
      .set(authHeader(token))
      .send({ paymentMethod: 'wallet' });

    expect(res.status).toBe(409);
    expect(res.body.errorCode).toBe('INSUFFICIENT_WALLET_BALANCE');
    // The transaction should not leave behind a payment or wallet movement.
    expect(await WalletTransaction.countDocuments({ user: staff._id })).toBe(0);
    expect(await Payment.countDocuments({ session: session._id })).toBe(0);
    const refreshed = await ParkingSession.findById(session._id);
    expect(refreshed.status).toBe('active');
  });

  it('TC15_Ra_MatThe_Phat - Force checkout adds penalty fee and closes session', async () => {
    const { token, staff, building } = await createStaffContext();
    const session = await seedActiveSession({ building, staff, plateNumber: 'FORCE111', checkInAt: new Date(Date.now() - 2 * 60 * 60 * 1000) });

    const res = await request(app)
      .patch(`/api/staff/parking-sessions/${session._id}/check-out`)
      .set(authHeader(token))
      .send({ forceCheckoutReason: 'Lost ticket', paymentMethod: 'cash' });

    expect(res.status).toBe(200);
    // The forced checkout should carry a penalty and must be reflected in the audit log.
    expect(res.body.data.status).toBe('closed');
    expect(res.body.data.fee).toBeGreaterThan(0);
    await expectAuditAction('FORCE_VEHICLE_CHECKOUT', building._id);
  });
});

describe('Các API lấy dữ liệu và tìm kiếm (GET Active, GET Detail, GET Search)', () => {
  it('TC16_ListActive_DungBai - Active sessions are returned for the assigned building', async () => {
    const { token, staff, building } = await createStaffContext();
    await seedActiveSession({ building, staff, plateNumber: 'ACT111' });
    await seedActiveSession({ building, staff, plateNumber: 'ACT222' });

    const res = await request(app)
      .get('/api/staff/parking-sessions/active')
      .set(authHeader(token))
      .query({ buildingId: building._id.toString() });

    expect(res.status).toBe(200);
    // The list must only contain sessions inside the requested, assigned building.
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.items.every((item) => String(item.building) === String(building._id))).toBe(true);
  });

  it('TC17_ListActive_SaiBai - Querying an unassigned building is forbidden', async () => {
    const { token, foreignBuilding } = await createStaffContext();

    const res = await request(app)
      .get('/api/staff/parking-sessions/active')
      .set(authHeader(token))
      .query({ buildingId: foreignBuilding._id.toString() });

    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('FORBIDDEN_BUILDING_SCOPE');
  });

  it('TC18_ChiTiet_DungBai - Session detail is visible in assigned building', async () => {
    const { token, staff, building } = await createStaffContext();
    const session = await seedActiveSession({ building, staff, plateNumber: 'DET111' });

    const res = await request(app)
      .get(`/api/staff/parking-sessions/${session._id}`)
      .set(authHeader(token));

    expect(res.status).toBe(200);
    // The session detail must return the same document that was seeded for the assigned building.
    expect(res.body.data.plateNumber).toBe('DET111');
    expect(String(res.body.data.building)).toBe(String(building._id));
  });

  it('TC19_ChiTiet_SaiBai - Cross-building session detail is blocked', async () => {
    const { token, staff, foreignBuilding } = await createStaffContext();
    const foreignSession = await seedActiveSession({ building: foreignBuilding, staff, plateNumber: 'DET999' });

    const res = await request(app)
      .get(`/api/staff/parking-sessions/${foreignSession._id}`)
      .set(authHeader(token));

    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('FORBIDDEN_BUILDING_SCOPE');
  });

  it('TC20_TimKiem_GioiHanPhamVi - Search only returns sessions in assigned buildings', async () => {
    const { token, staff, building, foreignBuilding } = await createStaffContext();
    await seedActiveSession({ building, staff, plateNumber: 'PLT-SCOPE-1' });
    await seedActiveSession({ building: foreignBuilding, staff, plateNumber: 'PLT-SCOPE-1' });

    const res = await request(app)
      .get('/api/staff/parking-sessions/search')
      .set(authHeader(token))
      .query({ plate: 'PLT-SCOPE-1' });

    expect(res.status).toBe(200);
    // The search response must not leak sessions from other buildings.
    expect(res.body.data.items).toHaveLength(1);
    expect(String(res.body.data.items[0].building)).toBe(String(building._id));
  });
});
