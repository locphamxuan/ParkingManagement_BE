/**
 * staff: listFreeSlots — lọc slot trống theo ĐỐI TƯỢNG (usageType, chuỗi fallback)
 * + trả bối cảnh sức chứa (totalSlots/totalAvailable) để FE phân biệt các trạng thái
 * rỗng. Bảo vệ luật: khách vãng lai KHÔNG được lấn slot hội viên/gói/đặt chỗ.
 */
const db = require('../../helpers/db');
const f = require('../../helpers/fixtures');
const { listFreeSlots } = require('../../../src/services/staff/parkingSession/query.service');

let building, staff, vt, floor;

async function seed() {
  building = await f.createBuilding({ operatingHours: { open: '00:00', close: '23:59' } });
  staff = await f.createUser({ role: 'staff' });
  staff.assignedBuildings = [building._id];
  vt = await f.createVehicleType(building._id);
  floor = await f.createFloor(building._id, { capacity: 100 });
}

// Mỗi slot 1 zone riêng (usageType denormalize từ zone) để dựng nhiều đối tượng.
async function addSlot(usageType, status = 'available') {
  const zone = await f.createZone(building._id, floor._id, vt._id, { usageType });
  return f.createSlot(building._id, floor._id, {
    zone: zone._id, vehicleType: vt._id, usageType, status,
  });
}

beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => { await db.clear(); await seed(); });

describe('listFreeSlots — lọc đối tượng + bối cảnh sức chứa', () => {
  test('walk_in: chỉ trả slot walk_in, KHÔNG lộ slot registered/subscriber', async () => {
    await addSlot('walk_in');
    await addSlot('registered');
    await addSlot('subscriber');

    const res = await listFreeSlots(staff, building._id, { usageType: 'walk_in' });

    expect(res.items).toHaveLength(1);
    expect(res.items[0].usageType).toBe('walk_in');
    expect(res.totalSlots).toBe(3);
    expect(res.totalAvailable).toBe(3);
  });

  test('registered: trả registered + walk_in (fallback một chiều), loại subscriber', async () => {
    await addSlot('walk_in');
    await addSlot('registered');
    await addSlot('subscriber');

    const res = await listFreeSlots(staff, building._id, { usageType: 'registered' });

    const kinds = res.items.map((s) => s.usageType).sort();
    expect(kinds).toEqual(['registered', 'walk_in']);
  });

  test('subscriber: trả subscriber + registered + walk_in theo đúng chuỗi', async () => {
    await addSlot('walk_in');
    await addSlot('registered');
    await addSlot('subscriber');

    const res = await listFreeSlots(staff, building._id, { usageType: 'subscriber' });

    expect(res.items).toHaveLength(3);
    // Slot đúng đối tượng (subscriber) phải được gợi ý (xếp đầu).
    expect(res.items[0].usageType).toBe('subscriber');
    expect(String(res.suggestedSlotId)).toBe(String(res.items[0]._id));
  });

  test('vãng lai hết slot walk_in nhưng còn slot subscriber: items rỗng, totalAvailable>0', async () => {
    await addSlot('walk_in', 'occupied'); // walk_in đã đầy
    await addSlot('subscriber');          // còn slot subscriber trống (không được lấn)

    const res = await listFreeSlots(staff, building._id, { usageType: 'walk_in' });

    expect(res.items).toHaveLength(0);      // không có slot hợp đối tượng
    expect(res.totalSlots).toBe(2);
    expect(res.totalAvailable).toBe(1);     // tòa vẫn còn slot trống → FE phân biệt được
  });
});
