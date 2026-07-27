/**
 * Ownership biển số (P2-B) — service phải tự xác minh biển thuộc đúng account,
 * không tin vào việc FE chỉ cho chọn biển trong account. Mỗi case kiểm chứng
 * side-effect: ví KHÔNG bị trừ / phiên KHÔNG được tạo.
 */
const db = require('../../helpers/db');
const f = require('../../helpers/fixtures');
const longTermService = require('../../../src/services/user/longTerm.service');
const kioskService = require('../../../src/services/kiosk.service');
const {
  LongTermSubscription,
  ParkingSession,
  ParkingSlot,
  User,
} = require('../../../src/models');

jest.setTimeout(180000);

const DAY = 24 * 60 * 60 * 1000;

let building;
let floor;
let vehicleType;
let pkg;

beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });

beforeEach(async () => {
  await db.clear();
  f.resetSeq();
  building = await f.createBuilding();
  vehicleType = await f.createVehicleType(building._id);
  floor = await f.createFloor(building._id, { capacity: 50 });
  pkg = await f.createPackage(building._id, vehicleType._id, { price: 300_000 });
});

const walletOf = async (userId) => (await User.findById(userId)).walletBalance;

test('mua gói bằng biển KHÔNG thuộc account → 403 PLATE_OWNERSHIP_REQUIRED, không trừ ví', async () => {
  const buyer = await f.createUser({
    walletBalance: 1_000_000,
    licensePlates: [{ plateNumber: '51F-111.11', vehicleType: 'car' }],
  });
  // Biển của người khác — FE không cho chọn, nhưng API có thể bị gọi trực tiếp.
  await f.createUser({ licensePlates: [{ plateNumber: '99Z-999.99', vehicleType: 'car' }] });

  await expect(longTermService.subscribe(buyer._id, {
    packageId: pkg._id,
    plateNumber: '99Z-999.99',
  })).rejects.toMatchObject({
    statusCode: 403,
    errorCode: 'PLATE_OWNERSHIP_REQUIRED',
  });

  expect(await walletOf(buyer._id)).toBe(1_000_000);
  expect(await LongTermSubscription.countDocuments({})).toBe(0);
});

test('gia hạn khi biển đã bị gỡ khỏi account → 403 PLATE_OWNERSHIP_REQUIRED, không trừ ví', async () => {
  const owner = await f.createUser({
    walletBalance: 1_000_000,
    licensePlates: [{ plateNumber: '51F-222.22', vehicleType: 'car' }],
  });
  const sub = await LongTermSubscription.create({
    user: owner._id,
    package: pkg._id,
    building: building._id,
    plateNumber: '51F-222.22',
    startDate: new Date(Date.now() - 10 * DAY),
    endDate: new Date(Date.now() + DAY),
    status: 'active',
  });
  // Biển rời account (dữ liệu cũ tạo trước khi có guard xóa biển).
  await User.updateOne({ _id: owner._id }, { $set: { licensePlates: [] } });

  await expect(longTermService.renewSubscription(owner._id, sub._id)).rejects.toMatchObject({
    statusCode: 403,
    errorCode: 'PLATE_OWNERSHIP_REQUIRED',
  });

  expect(await walletOf(owner._id)).toBe(1_000_000);
  expect((await LongTermSubscription.findById(sub._id)).endDate).toEqual(sub.endDate);
});

test('kiosk: chủ QR khác chủ gói → từ chối, KHÔNG tạo phiên gửi xe', async () => {
  const plateNumber = '51F-333.33';
  // Người quét QR sở hữu biển…
  const qrOwner = await f.createUser({
    licensePlates: [{ plateNumber, vehicleType: 'car' }],
  });
  // …nhưng gói dài hạn của biển này lại đứng tên account khác.
  const packageOwner = await f.createUser();
  const dedicatedSlot = await f.createSlot(building._id, floor._id, {
    usageType: 'subscriber',
    vehicleType: vehicleType._id,
    status: 'reserved',
  });
  await LongTermSubscription.create({
    user: packageOwner._id,
    package: pkg._id,
    building: building._id,
    plateNumber,
    slot: dedicatedSlot._id,
    startDate: new Date(Date.now() - DAY),
    endDate: new Date(Date.now() + 29 * DAY),
    status: 'active',
  });
  const qrCode = (await User.findById(qrOwner._id)).licensePlates[0].qrCode;

  await expect(kioskService.selfCheckInByQr({ qrCode })).rejects.toMatchObject({
    statusCode: 404,
    errorCode: 'SUBSCRIPTION_NOT_FOUND',
  });

  expect(await ParkingSession.countDocuments({})).toBe(0);
  // Slot của gói không bị đụng tới.
  expect((await ParkingSlot.findById(dedicatedSlot._id)).status).toBe('reserved');
});
