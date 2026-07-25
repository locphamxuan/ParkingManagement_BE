/**
 * P1-B — staff và kiosk phải dùng CHUNG một helper giờ hoạt động, nên với cùng
 * một tòa nhà tại cùng một thời điểm, hai đường phải cho CÙNG kết quả.
 *
 * Cửa sổ giờ được dựng tương đối theo giờ nghiệp vụ hiện tại (không hard-code
 * "06:00–22:00") để test đúng ở mọi thời điểm chạy CI, và phủ cả dạng trong ngày
 * (open < close) lẫn qua đêm (open > close).
 */
const db = require('../../helpers/db');
const f = require('../../helpers/fixtures');
const { checkIn } = require('../../../src/services/staff/parkingSession/checkIn.service');
const kioskService = require('../../../src/services/kiosk.service');
const { LongTermSubscription, Building, ParkingSession, User } = require('../../../src/models');
const { BUSINESS_TIMEZONE } = require('../../../src/utils/businessTime');

jest.setTimeout(180000);

const IMG = 'data:image/png;base64,AAAA';
const DAY = 24 * 60 * 60 * 1000;

const currentBusinessMinutes = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === 'hour').value);
  const minute = Number(parts.find((p) => p.type === 'minute').value);
  return hour * 60 + minute;
};

const hhmm = (minutes) => {
  const value = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
};

let building;
let floor;
let vehicleType;
let staff;
let qrCode;

beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });

beforeEach(async () => {
  await db.clear();
  f.resetSeq();
  building = await f.createBuilding();
  vehicleType = await f.createVehicleType(building._id);
  floor = await f.createFloor(building._id, { capacity: 50 });

  staff = await f.createUser({ role: 'staff' });
  staff.assignedBuildings = [building._id];
  const shift = await f.createShift(building._id);
  await f.createStaffShift(building._id, staff._id, shift._id, { status: 'active' });

  // Slot cho lượt staff check-in (walk-in).
  await f.createSlot(building._id, floor._id, {
    vehicleType: vehicleType._id,
    usageType: 'walk_in',
    status: 'available',
  });

  // Khách gói + QR cho lượt kiosk.
  const pkg = await f.createPackage(building._id, vehicleType._id);
  const subscriber = await f.createUser({
    licensePlates: [{ plateNumber: '51F-777.77', vehicleType: 'car' }],
  });
  const dedicatedSlot = await f.createSlot(building._id, floor._id, {
    vehicleType: vehicleType._id,
    usageType: 'subscriber',
    status: 'reserved',
  });
  await LongTermSubscription.create({
    user: subscriber._id,
    package: pkg._id,
    building: building._id,
    plateNumber: '51F-777.77',
    slot: dedicatedSlot._id,
    startDate: new Date(Date.now() - DAY),
    endDate: new Date(Date.now() + 29 * DAY),
    status: 'active',
  });
  qrCode = (await User.findById(subscriber._id)).licensePlates[0].qrCode;
});

const setHours = (open, close) =>
  Building.updateOne({ _id: building._id }, { $set: { operatingHours: { open, close } } });

/** Chạy một đường vào bãi, trả 'ok' hoặc errorCode — để so sánh hai đường. */
const staffOutcome = async () => {
  try {
    await checkIn(staff, {
      building: building._id,
      plateNumber: '51F-123.45',
      vehicleType: vehicleType._id,
      portraitImage: IMG,
      plateImage: IMG,
    });
    return 'ok';
  } catch (error) {
    return error.errorCode || 'UNKNOWN';
  }
};

const kioskOutcome = async () => {
  try {
    await kioskService.selfCheckInByQr({ qrCode });
    return 'ok';
  } catch (error) {
    return error.errorCode || 'UNKNOWN';
  }
};

const windowsFor = (cur) => ({
  // Trong ngày, KHÔNG chứa thời điểm hiện tại.
  daytimeClosed: cur < 720
    ? { open: hhmm(cur + 60), close: hhmm(cur + 120) }
    : { open: hhmm(cur - 120), close: hhmm(cur - 60) },
  // Trong ngày, CHỨA thời điểm hiện tại. Ở đúng phút 23:59 không tồn tại cửa sổ
  // trong ngày nào chứa nó (close là mốc loại trừ, tối đa 23:59) → dùng dạng qua
  // đêm cho trường hợp biên đó.
  daytimeOpen: cur === 1439
    ? { open: hhmm(cur + 120), close: hhmm(cur + 60) }
    : { open: '00:00', close: hhmm(cur + 1) },
  // Qua đêm, CHỨA hiện tại: [open,24:00) ∪ [0,close) với open > close.
  overnightOpen: { open: hhmm(cur + 120), close: hhmm(cur + 60) },
  // Qua đêm, KHÔNG chứa hiện tại.
  overnightClosed: { open: hhmm(cur + 30), close: hhmm(cur - 30) },
});

describe('staff và kiosk đồng nhất về giờ hoạt động', () => {
  test.each([
    ['trong ngày, ngoài giờ', 'daytimeClosed', 'BUILDING_CLOSED'],
    ['trong ngày, trong giờ', 'daytimeOpen', 'ok'],
    ['qua đêm, trong giờ', 'overnightOpen', 'ok'],
    ['qua đêm, ngoài giờ', 'overnightClosed', 'BUILDING_CLOSED'],
  ])('%s → hai đường cho cùng kết quả (%s)', async (_label, windowKey, expected) => {
    const { open, close } = windowsFor(currentBusinessMinutes())[windowKey];
    await setHours(open, close);

    const staffResult = await staffOutcome();
    const kioskResult = await kioskOutcome();

    expect(staffResult).toBe(expected);
    expect(kioskResult).toBe(expected);
    expect(staffResult).toBe(kioskResult);
  });

  test('tòa maintenance chặn CẢ staff lẫn kiosk, không tạo phiên nào', async () => {
    await Building.updateOne({ _id: building._id }, { $set: { status: 'maintenance' } });

    expect(await staffOutcome()).toBe('BUILDING_MAINTENANCE');
    expect(await kioskOutcome()).toBe('BUILDING_MAINTENANCE');
    expect(await ParkingSession.countDocuments({})).toBe(0);
  });

  test('tòa inactive chặn CẢ staff lẫn kiosk', async () => {
    await Building.updateOne({ _id: building._id }, { $set: { status: 'inactive' } });

    expect(await staffOutcome()).toBe('BUILDING_INACTIVE');
    expect(await kioskOutcome()).toBe('BUILDING_INACTIVE');
    expect(await ParkingSession.countDocuments({})).toBe(0);
  });
});
