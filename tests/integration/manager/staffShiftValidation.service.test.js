const db = require('../../helpers/db');
const f = require('../../helpers/fixtures');
const BuildingManager = require('../../../src/models/building/BuildingManager');
const shiftService = require('../../../src/services/manager/shift.service');

beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });
afterEach(async () => { await db.clear(); });

const setup = async () => {
  const building = await f.createBuilding();
  const otherBuilding = await f.createBuilding();
  const manager = await f.managerFor([building._id, otherBuilding._id]);
  const staff = await f.createUser({ role: 'staff' });
  await BuildingManager.create({
    building: building._id,
    user: staff._id,
    isActive: true,
  });
  const shift = await f.createShift(building._id);
  const otherShift = await f.createShift(otherBuilding._id);
  const assignment = await shiftService.assignStaffShift(manager, building._id, {
    shift: shift._id,
    staff: staff._id,
    workDate: new Date(),
  });
  return {
    building,
    otherBuilding,
    manager,
    staff,
    shift,
    otherShift,
    assignment,
  };
};

test('partial update rejects a shift from another building', async () => {
  const context = await setup();

  await expect(shiftService.updateStaffShift(
    context.manager,
    context.building._id,
    context.assignment._id,
    { shift: context.otherShift._id },
  )).rejects.toMatchObject({
    statusCode: 404,
    errorCode: 'SHIFT_BUILDING_MISMATCH',
  });
});

test('partial update rejects inactive and unassigned staff', async () => {
  const context = await setup();
  const inactive = await f.createUser({ role: 'staff' });
  await BuildingManager.create({
    building: context.building._id,
    user: inactive._id,
    isActive: true,
  });
  await inactive.updateOne({ isActive: false });

  await expect(shiftService.updateStaffShift(
    context.manager,
    context.building._id,
    context.assignment._id,
    { staff: inactive._id },
  )).rejects.toMatchObject({ statusCode: 400 });

  const unassigned = await f.createUser({ role: 'staff' });
  await expect(shiftService.updateStaffShift(
    context.manager,
    context.building._id,
    context.assignment._id,
    { staff: unassigned._id },
  )).rejects.toMatchObject({
    statusCode: 403,
    errorCode: 'STAFF_BUILDING_MISMATCH',
  });
});

test('update query cannot reach an assignment through another building scope', async () => {
  const context = await setup();

  await expect(shiftService.updateStaffShift(
    context.manager,
    context.otherBuilding._id,
    context.assignment._id,
    { status: 'active' },
  )).rejects.toMatchObject({ statusCode: 404 });
});
