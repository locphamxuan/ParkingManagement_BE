const db = require('../../helpers/db');
const f = require('../../helpers/fixtures');
const { listFreeSlots } = require('../../../src/services/staff/parkingSession/query.service');

beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });
afterEach(async () => { await db.clear(); });

test('universal usageType=null is compatible and ranks after an exact match', async () => {
  const building = await f.createBuilding();
  const staff = await f.createUser({ role: 'staff' });
  staff.assignedBuildings = [building._id];
  const vehicleType = await f.createVehicleType(building._id);
  const floor = await f.createFloor(building._id);
  const exact = await f.createSlot(building._id, floor._id, {
    usageType: 'walk_in',
    vehicleType: vehicleType._id,
  });
  const universal = await f.createSlot(building._id, floor._id, {
    vehicleType: vehicleType._id,
  });

  const result = await listFreeSlots(staff, building._id, { usageType: 'walk_in' });

  expect(result.items.map((slot) => String(slot._id))).toEqual([
    String(exact._id),
    String(universal._id),
  ]);
  expect(result.items[1].usageType).toBeNull();
});
