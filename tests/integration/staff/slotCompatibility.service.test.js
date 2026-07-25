/**
 * Characterization test cho HAI đường chọn slot:
 *  - auto-selection lúc check-in  → helpers.findCompatibleSlots
 *  - danh sách staff chọn tay     → query.service.listFreeSlots
 * Mục tiêu: khoá behavior hiện hữu (usage chain, slot vạn năng usageType=null xếp
 * cuối, và KHÁC BIỆT CHỦ ĐÍCH về vehicleType) để lần trích xuất hàm dùng chung
 * không làm trôi hành vi công khai.
 */
const db = require('../../helpers/db');
const f = require('../../helpers/fixtures');
const { findCompatibleSlots, acceptableUsageTypes } = require('../../../src/services/staff/parkingSession/helpers');
const queryService = require('../../../src/services/staff/parkingSession/query.service');

jest.setTimeout(120000);

let building;
let floor;
let carType;
let motorbikeType;
let staff;

beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });

beforeEach(async () => {
  await db.clear();
  building = await f.createBuilding();
  floor = await f.createFloor(building._id, { capacity: 100 });
  carType = await f.createVehicleType(building._id, { code: 'CAR', name: 'Car' });
  motorbikeType = await f.createVehicleType(building._id, { code: 'MOTORBIKE', name: 'Motorbike' });
  staff = await f.createUser({ role: 'staff' });
  staff.assignedBuildings = [building._id];
});

const mkSlot = (code, over = {}) => f.createSlot(building._id, floor._id, {
  code,
  vehicleType: carType._id,
  usageType: 'walk_in',
  ...over,
});

const codesOf = (slots) => slots.map((slot) => slot.code);

describe('usage chain dùng chung', () => {
  test('fallback một chiều: subscriber mượn được slot dưới, walk_in không lấn lên', () => {
    expect(acceptableUsageTypes('subscriber')).toEqual(['subscriber', 'registered', 'walk_in']);
    expect(acceptableUsageTypes('registered')).toEqual(['registered', 'walk_in']);
    expect(acceptableUsageTypes('walk_in')).toEqual(['walk_in']);
    expect(acceptableUsageTypes(null)).toEqual([]);
  });
});

describe('auto-selection (findCompatibleSlots)', () => {
  test('đúng đối tượng đứng trước fallback, slot vạn năng usageType=null xếp CUỐI', async () => {
    await mkSlot('W1', { usageType: 'walk_in' });
    await mkSlot('U1', { usageType: null });
    await mkSlot('S1', { usageType: 'subscriber' });
    await mkSlot('R1', { usageType: 'registered' });

    const slots = await findCompatibleSlots(building._id, carType._id, 'subscriber');

    expect(codesOf(slots)).toEqual(['S1', 'R1', 'W1', 'U1']);
  });

  test('walk_in không thấy slot của subscriber/registered, vẫn thấy slot vạn năng', async () => {
    await mkSlot('S1', { usageType: 'subscriber' });
    await mkSlot('R1', { usageType: 'registered' });
    await mkSlot('W1', { usageType: 'walk_in' });
    await mkSlot('U1', { usageType: null });

    const slots = await findCompatibleSlots(building._id, carType._id, 'walk_in');

    expect(codesOf(slots)).toEqual(['W1', 'U1']);
  });

  test('LỌC theo loại xe: chỉ nhận đúng loại xe hoặc slot vehicleType=null', async () => {
    await mkSlot('CAR1', { vehicleType: carType._id });
    await mkSlot('MOTO1', { vehicleType: motorbikeType._id });
    await mkSlot('ANY1', { vehicleType: null });

    const slots = await findCompatibleSlots(building._id, carType._id, 'walk_in');

    expect(codesOf(slots)).toEqual(['CAR1', 'ANY1']);
  });

  test('slot không available bị loại', async () => {
    await mkSlot('OK1');
    await mkSlot('BUSY', { status: 'occupied' });
    await mkSlot('FIX', { status: 'maintenance' });
    await mkSlot('RES', { status: 'reserved' });

    const slots = await findCompatibleSlots(building._id, carType._id, 'walk_in');

    expect(codesOf(slots)).toEqual(['OK1']);
  });
});

describe('danh sách chọn tay (listFreeSlots)', () => {
  test('cùng quy tắc đối tượng: fallback theo chain, slot vạn năng xếp cuối', async () => {
    await mkSlot('W1', { usageType: 'walk_in' });
    await mkSlot('U1', { usageType: null });
    await mkSlot('S1', { usageType: 'subscriber' });
    await mkSlot('R1', { usageType: 'registered' });

    const res = await queryService.listFreeSlots(staff, building._id, {
      usageType: 'subscriber',
      vehicleType: 'car',
    });

    expect(codesOf(res.items)).toEqual(['S1', 'R1', 'W1', 'U1']);
    expect(`${res.suggestedSlotId}`).toBe(`${res.items[0]._id}`);
  });

  test('KHÁC BIỆT CHỦ ĐÍCH: loại xe chỉ dùng để XẾP HẠNG, không lọc bỏ', async () => {
    await mkSlot('MOTO1', { vehicleType: motorbikeType._id });
    await mkSlot('CAR1', { vehicleType: carType._id });

    const res = await queryService.listFreeSlots(staff, building._id, {
      usageType: 'walk_in',
      vehicleType: 'car',
    });

    // Slot đúng loại xe lên đầu, nhưng slot loại xe khác VẪN có mặt để staff chọn
    // tay (manager có thể cấu hình loại xe riêng). Auto-selection thì lọc bỏ.
    expect(codesOf(res.items)).toEqual(['CAR1', 'MOTO1']);

    const auto = await findCompatibleSlots(building._id, carType._id, 'walk_in');
    expect(codesOf(auto)).toEqual(['CAR1']);
  });

  test('trả bối cảnh sức chứa toàn tòa để FE phân biệt "hết chỗ" và "chỗ của đối tượng khác"', async () => {
    await mkSlot('S1', { usageType: 'subscriber' });
    await mkSlot('W1', { usageType: 'walk_in', status: 'occupied' });

    const res = await queryService.listFreeSlots(staff, building._id, { usageType: 'walk_in' });

    expect(res.items).toEqual([]);
    expect(res.totalSlots).toBe(2);
    expect(res.totalAvailable).toBe(1); // còn trống nhưng thuộc đối tượng khác
  });
});

describe('hai đường không được trôi lệch về usageType/null ranking', () => {
  test('cùng tập slot + cùng đối tượng → cùng thứ tự usageType', async () => {
    await mkSlot('U1', { usageType: null });
    await mkSlot('W1', { usageType: 'walk_in' });
    await mkSlot('S1', { usageType: 'subscriber' });
    await mkSlot('R1', { usageType: 'registered' });

    for (const usageType of ['subscriber', 'registered', 'walk_in']) {
      const auto = await findCompatibleSlots(building._id, carType._id, usageType);
      const manual = await queryService.listFreeSlots(staff, building._id, { usageType });

      const usageOrder = (slots) => slots.map((slot) => slot.usageType ?? null);
      expect(usageOrder(manual.items)).toEqual(usageOrder(auto));
    }
  });
});
