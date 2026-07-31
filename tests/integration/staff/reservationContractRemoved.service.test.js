/**
 * Đặt chỗ theo giờ (reservation) đã bị gỡ khỏi sản phẩm. Test này KHOÁ hợp đồng API
 * mà FE/Mobile dựa vào: staff chỉ phân loại xe thành GÓI DÀI HẠN (`hasActivePackage`)
 * hoặc THƯỜNG — không còn field `activeReservation` / `isReservation` /
 * `reservationRemainingFee` nào được trả về để client dựng lại luồng đặt chỗ.
 */
const db = require('../../helpers/db');
const f = require('../../helpers/fixtures');
const queryService = require('../../../src/services/staff/parkingSession/query.service');
const usersService = require('../../../src/services/staff/users.service');
const { checkIn } = require('../../../src/services/staff/parkingSession/checkIn.service');
const LongTermSubscription = require('../../../src/models/policy/LongTermSubscription');
const User = require('../../../src/models/user/User');
const Vehicle = require('../../../src/models/vehicle/Vehicle');

jest.setTimeout(120000);

const IMG = 'data:image/png;base64,AAAA';
const PLATE = '51F-123.45';
const DAY = 24 * 60 * 60 * 1000;
const RESERVATION_FIELDS = ['activeReservation', 'isReservation', 'reservationRemainingFee'];

let building, floor, vehicleType, staff, owner;

beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });

beforeEach(async () => {
  await db.clear();
  f.resetSeq();
  building = await f.createBuilding({ operatingHours: { open: '00:00', close: '23:59' } });
  vehicleType = await f.createVehicleType(building._id);
  floor = await f.createFloor(building._id, { capacity: 100 });
  staff = await f.createUser({ role: 'staff' });
  staff.assignedBuildings = [building._id];
  const shift = await f.createShift(building._id, { startTime: '00:00', endTime: '23:59' });
  await f.createStaffShift(building._id, staff._id, shift._id);
  owner = await f.createUser({ vehicles: [{ plateNumber: PLATE, category: 'car' }] });
});

const subscribe = async () => {
  const pkg = await f.createPackage(building._id, vehicleType._id, { maxHoursPerDay: 24 });
  return LongTermSubscription.create({
    user: owner._id,
    package: pkg._id,
    building: building._id,
    plateNumber: PLATE,
    startDate: new Date(Date.now() - DAY),
    endDate: new Date(Date.now() + 30 * DAY),
    status: 'active',
  });
};

describe('staff lookup contract', () => {
  test('lookupPlate của xe THƯỜNG: không có gói, không có field reservation nào', async () => {
    const result = await queryService.lookupPlate(staff, PLATE, building._id);

    expect(result.hasActivePackage).toBe(false);
    expect(result.activePackage).toBeNull();
    expect(result.usageType).toBe('registered');
    RESERVATION_FIELDS.forEach((field) => expect(result).not.toHaveProperty(field));
  });

  test('lookupPlate của xe CÓ GÓI: trả activePackage, vẫn không có field reservation', async () => {
    await subscribe();

    const result = await queryService.lookupPlate(staff, PLATE, building._id);

    expect(result.hasActivePackage).toBe(true);
    expect(result.usageType).toBe('subscriber');
    RESERVATION_FIELDS.forEach((field) => expect(result).not.toHaveProperty(field));
  });

  test('lookupQr / lookupPlateQr chỉ trả gói dài hạn, không trả reservation', async () => {
    await subscribe();
    const qrCode = (await Vehicle.findOne({ owner: owner._id })).qrCode;

    const byUser = await usersService.lookupQr(staff, String(owner._id), building._id);
    const byPlate = await usersService.lookupPlateQr(staff, qrCode, building._id);

    expect(byUser.activePackages).toHaveLength(1);
    RESERVATION_FIELDS.forEach((field) => {
      expect(byUser).not.toHaveProperty(field);
      expect(byPlate).not.toHaveProperty(field);
    });
  });
});

describe('staff check-in chỉ có 2 nhóm: gói dài hạn hoặc thường', () => {
  const doCheckIn = () => checkIn(staff, {
    building: building._id, plateNumber: PLATE, vehicleType: vehicleType._id,
    portraitImage: IMG, plateImage: IMG,
  });

  test('không có gói → phiên thường (paymentMethod chưa chốt, phí tính lúc ra)', async () => {
    await f.createSlot(building._id, floor._id, { vehicleType: vehicleType._id, usageType: 'registered' });

    const created = await doCheckIn();

    expect(created.paymentMethod).not.toBe('long_term');
    expect(created.status).toBe('active');
  });

  test('có gói → phiên long_term, fee 0', async () => {
    await f.createSlot(building._id, floor._id, { vehicleType: vehicleType._id, usageType: 'subscriber' });
    await subscribe();

    const created = await doCheckIn();

    expect(created.paymentMethod).toBe('long_term');
    expect(created.fee).toBe(0);
  });

  test('danh sách xe đang đỗ chỉ gắn cờ long_term/member — không có cờ reservation', async () => {
    await f.createSlot(building._id, floor._id, { vehicleType: vehicleType._id, usageType: 'registered' });
    await doCheckIn();

    const [item] = await queryService.listActive(staff, { building: building._id });

    expect(item).toHaveProperty('isLongTerm', false);
    expect(item).toHaveProperty('currentFee');
    RESERVATION_FIELDS.forEach((field) => expect(item).not.toHaveProperty(field));
  });
});
