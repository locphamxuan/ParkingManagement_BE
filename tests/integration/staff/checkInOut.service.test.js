/** staff: check-in + check-out (walk-in). Luồng vận hành cốt lõi tại cổng. */
const db = require('../../helpers/db');
const f = require('../../helpers/fixtures');
const { checkIn } = require('../../../src/services/staff/parkingSession/checkIn.service');
const { checkOut } = require('../../../src/services/staff/parkingSession/checkOut.service');
const ParkingSlot = require('../../../src/models/building/ParkingSlot');
const ParkingSession = require('../../../src/models/operations/ParkingSession');

let building, staff, vt, floor, zone, slot;

const IMG = 'data:image/png;base64,AAAA';

async function seedScene(over = {}) {
  building = await f.createBuilding({ operatingHours: { open: '00:00', close: '23:59' } });
  staff = await f.createUser({ role: 'staff' });
  staff.assignedBuildings = [building._id];
  vt = await f.createVehicleType(building._id);
  floor = await f.createFloor(building._id, { capacity: 100 });
  zone = await f.createZone(building._id, floor._id, vt._id, { usageType: over.usageType || 'walk_in' });
  slot = await f.createSlot(building._id, floor._id, {
    zone: zone._id, vehicleType: vt._id, usageType: over.usageType || 'walk_in',
  });
  const shift = await f.createShift(building._id);
  await f.createStaffShift(building._id, staff._id, shift._id, { status: 'active' });
}

beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => { await db.clear(); await seedScene(); });

describe('checkIn (walk-in)', () => {
  test('QR check-in retains only portrait evidence', async () => {
    const created = await checkIn(staff, {
      building: building._id,
      plateNumber: '51F-123.45',
      vehicleType: vt._id,
      plateImage: IMG,
      portraitImage: IMG,
      identificationMethod: 'qr',
    });

    expect(created.plateImage).toBeNull();
    expect(created.portraitImage).toBe(IMG);
  });

  test('tạo phiên active, tự gán slot walk-in, slot → occupied', async () => {
    const created = await checkIn(staff, {
      building: building._id, plateNumber: '51F-123.45', vehicleType: vt._id,
      portraitImage: IMG, plateImage: IMG,
    });
    expect(created.status).toBe('active');
    expect(String(created.slot)).toBe(String(slot._id));
    const freshSlot = await ParkingSlot.findById(slot._id);
    expect(freshSlot.status).toBe('occupied');
  });

  test('thiếu ảnh chân dung → 400 PORTRAIT_REQUIRED', async () => {
    await expect(checkIn(staff, {
      building: building._id, plateNumber: '51F-123.45', vehicleType: vt._id, plateImage: IMG,
    })).rejects.toMatchObject({ errorCode: 'PORTRAIT_REQUIRED' });
  });

  // Một biển = một phiên active/tòa là bất biến VẬT LÝ (xe không ở trong bãi 2 lần),
  // được chốt bằng unique index. forceCheckIn KHÔNG bỏ qua được nữa.
  test('trùng biển đang đỗ → 409 DUPLICATE_ACTIVE_SESSION, kể cả khi forceCheckIn', async () => {
    // Thêm slot thứ 2 để không chạm giới hạn sức chứa trước khi tới nhánh trùng biển.
    await f.createSlot(building._id, floor._id, { zone: zone._id, vehicleType: vt._id, usageType: 'walk_in' });
    await checkIn(staff, { building: building._id, plateNumber: '51F-123.45', vehicleType: vt._id, portraitImage: IMG, plateImage: IMG });

    await expect(checkIn(staff, {
      building: building._id, plateNumber: '51F-123.45', vehicleType: vt._id, portraitImage: IMG, plateImage: IMG,
    })).rejects.toMatchObject({ statusCode: 409, errorCode: 'DUPLICATE_ACTIVE_SESSION' });

    await expect(checkIn(staff, {
      building: building._id, plateNumber: '51F-123.45', vehicleType: vt._id, portraitImage: IMG, plateImage: IMG,
      forceCheckIn: true, overrideReason: 'khách nói xe đã ra',
    })).rejects.toMatchObject({ statusCode: 409, errorCode: 'DUPLICATE_ACTIVE_SESSION' });

    expect(await ParkingSession.countDocuments({ plateNumber: '51F-123.45', status: 'active' })).toBe(1);
  });

  test('không có ca hôm nay → 403 NO_SHIFT_ASSIGNED', async () => {
    const other = await f.createUser({ role: 'staff' });
    other.assignedBuildings = [building._id];
    await expect(checkIn(other, {
      building: building._id, plateNumber: '51F-123.45', vehicleType: vt._id, portraitImage: IMG, plateImage: IMG,
    })).rejects.toMatchObject({ errorCode: 'NO_ACTIVE_SHIFT' });
  });

  test('ngoài phạm vi tòa nhà được gán → 403', async () => {
    const outsider = await f.createUser({ role: 'staff' });
    outsider.assignedBuildings = []; // không có building
    await expect(checkIn(outsider, {
      building: building._id, plateNumber: '51F-123.45', vehicleType: vt._id, portraitImage: IMG, plateImage: IMG,
    })).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('checkOut (walk-in, tiền mặt)', () => {
  test('hoàn tất phiên: tính phí fallback, slot → available', async () => {
    const created = await checkIn(staff, {
      building: building._id, plateNumber: '51F-123.45', vehicleType: vt._id, portraitImage: IMG, plateImage: IMG,
    });
    // Lùi entryTime 2 giờ để phát sinh phí.
    await ParkingSession.findByIdAndUpdate(created._id, { entryTime: new Date(Date.now() - 2 * 3600 * 1000) });

    const done = await checkOut(staff, created._id, { paymentMethod: 'cash' });
    expect(done.status).toBe('completed');
    expect(done.fee).toBeGreaterThan(0);
    const freshSlot = await ParkingSlot.findById(slot._id);
    expect(freshSlot.status).toBe('available');
  });

  test('checkout phiên không tồn tại → 404', async () => {
    const mongoose = require('mongoose');
    await expect(checkOut(staff, new mongoose.Types.ObjectId(), { paymentMethod: 'cash' }))
      .rejects.toMatchObject({ statusCode: 404 });
  });
});
