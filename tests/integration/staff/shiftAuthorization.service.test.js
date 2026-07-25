const db = require('../../helpers/db');
const f = require('../../helpers/fixtures');
const StaffShift = require('../../../src/models/operations/StaffShift');
const {
  assertStaffHasActiveShift,
} = require('../../../src/services/shared/entryAuthorization.service');

const TZ = 'Asia/Ho_Chi_Minh';
const atLocal = (dateTime) => new Date(`${dateTime}+07:00`);

beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });
afterEach(async () => { await db.clear(); });

const seedAssignment = async ({
  startTime = '10:00',
  endTime = '12:00',
  workDate = atLocal('2026-07-25T00:00:00'),
  status = 'active',
} = {}) => {
  const building = await f.createBuilding();
  const staff = await f.createUser({ role: 'staff' });
  const shift = await f.createShift(building._id, { startTime, endTime });
  const assignment = await f.createStaffShift(
    building._id,
    staff._id,
    shift._id,
    { workDate, status },
  );
  return { building, staff, shift, assignment };
};

test('shift before, within, and after its real time window', async () => {
  const { building, staff, assignment } = await seedAssignment();

  await expect(assertStaffHasActiveShift(
    staff._id,
    building._id,
    atLocal('2026-07-25T09:59:00'),
    null,
    TZ,
  )).rejects.toMatchObject({ errorCode: 'SHIFT_NOT_STARTED' });

  await expect(assertStaffHasActiveShift(
    staff._id,
    building._id,
    atLocal('2026-07-25T11:00:00'),
    null,
    TZ,
  )).resolves.toMatchObject({ _id: assignment._id });

  await expect(assertStaffHasActiveShift(
    staff._id,
    building._id,
    atLocal('2026-07-25T12:00:00'),
    null,
    TZ,
  )).rejects.toMatchObject({ errorCode: 'SHIFT_ENDED' });
});

test('overnight shift authorizes the following morning but not another day', async () => {
  const { building, staff } = await seedAssignment({
    startTime: '22:00',
    endTime: '06:00',
  });

  await expect(assertStaffHasActiveShift(
    staff._id,
    building._id,
    atLocal('2026-07-26T05:30:00'),
    null,
    TZ,
  )).resolves.toBeTruthy();

  await expect(assertStaffHasActiveShift(
    staff._id,
    building._id,
    atLocal('2026-07-27T05:30:00'),
    null,
    TZ,
  )).rejects.toMatchObject({ errorCode: 'NO_ACTIVE_SHIFT' });
});

test('scheduled assignment authorizes inside its window but not all day', async () => {
  const { building, staff, assignment } = await seedAssignment({ status: 'scheduled' });

  await expect(assertStaffHasActiveShift(
    staff._id,
    building._id,
    atLocal('2026-07-25T11:00:00'),
    null,
    TZ,
  )).resolves.toMatchObject({ _id: assignment._id });

  await expect(assertStaffHasActiveShift(
    staff._id,
    building._id,
    atLocal('2026-07-25T15:00:00'),
    null,
    TZ,
  )).rejects.toMatchObject({ errorCode: 'SHIFT_ENDED' });
});

test('cancelled and completed assignments never authorize', async () => {
  for (const status of ['cancelled', 'completed']) {
    const { building, staff } = await seedAssignment({ status });

    await expect(assertStaffHasActiveShift(
      staff._id,
      building._id,
      atLocal('2026-07-25T11:00:00'),
      null,
      TZ,
    )).rejects.toMatchObject({ errorCode: 'NO_ACTIVE_SHIFT' });

    await db.clear();
  }
});

test('shift reference from another building is rejected explicitly', async () => {
  const building = await f.createBuilding();
  const otherBuilding = await f.createBuilding();
  const staff = await f.createUser({ role: 'staff' });
  const shift = await f.createShift(otherBuilding._id);
  await StaffShift.create({
    building: building._id,
    staff: staff._id,
    shift: shift._id,
    workDate: atLocal('2026-07-25T00:00:00'),
    status: 'active',
  });

  await expect(assertStaffHasActiveShift(
    staff._id,
    building._id,
    atLocal('2026-07-25T11:00:00'),
    null,
    TZ,
  )).rejects.toMatchObject({ errorCode: 'SHIFT_BUILDING_MISMATCH' });
});
