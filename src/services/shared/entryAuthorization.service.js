const AppError = require('../../utils/AppError');
const { StaffShift } = require('../../models');
const {
  BUSINESS_TIMEZONE,
  isWithinOperatingWindow,
  isWithinShiftWindow,
  getShiftWindowRelation,
} = require('../../utils/businessTime');

const assertBuildingAcceptsEntry = (
  building,
  now = new Date(),
  timeZone = BUSINESS_TIMEZONE,
) => {
  if (building.status === 'inactive') {
    throw new AppError('Building is inactive', 409, 'BUILDING_INACTIVE');
  }
  if (building.status === 'maintenance') {
    throw new AppError('Building is under maintenance', 409, 'BUILDING_MAINTENANCE');
  }
  if (building.status !== 'active') {
    throw new AppError('Building does not accept new entries', 409, 'BUILDING_INACTIVE');
  }

  const { open, close } = building.operatingHours || {};
  if (!isWithinOperatingWindow(open, close, now, timeZone)) {
    throw new AppError(
      `Building is outside operating hours (${open}–${close})`,
      409,
      'BUILDING_CLOSED',
    );
  }
};

const assertStaffHasActiveShift = async (
  staffId,
  buildingId,
  now = new Date(),
  mongoSession = null,
  timeZone = BUSINESS_TIMEZONE,
) => {
  const rangeStart = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const rangeEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  // 'scheduled' is the status every assignment is created with — authorization comes
  // from the real workDate + shift window below, never from the status label alone.
  // 'completed'/'cancelled' assignments never authorize.
  const query = StaffShift.find({
    staff: staffId,
    building: buildingId,
    workDate: { $gte: rangeStart, $lte: rangeEnd },
    status: { $in: ['scheduled', 'active'] },
  })
    .populate('shift', 'startTime endTime isActive building')
    .populate('gate', '_id building status');
  if (mongoSession) query.session(mongoSession);

  const assignments = await query;
  const activeAssignment = assignments.find((assignment) => (
    assignment.shift?.isActive !== false &&
    String(assignment.shift?.building) === String(buildingId) &&
    isWithinShiftWindow({
      workDate: assignment.workDate,
      startTime: assignment.shift?.startTime,
      endTime: assignment.shift?.endTime,
    }, now, timeZone)
  ));

  if (activeAssignment) return activeAssignment;

  const matchingBuilding = assignments.filter(
    (assignment) => String(assignment.shift?.building) === String(buildingId),
  );
  if (assignments.length && !matchingBuilding.length) {
    throw new AppError(
      'Assigned shift belongs to another building',
      403,
      'SHIFT_BUILDING_MISMATCH',
    );
  }

  const relations = matchingBuilding.map((assignment) => getShiftWindowRelation({
    workDate: assignment.workDate,
    startTime: assignment.shift?.startTime,
    endTime: assignment.shift?.endTime,
  }, now, timeZone));
  if (relations.includes('before')) {
    throw new AppError('Assigned shift has not started', 403, 'SHIFT_NOT_STARTED');
  }
  if (relations.includes('after')) {
    throw new AppError('Assigned shift has ended', 403, 'SHIFT_ENDED');
  }

  throw new AppError('No active shift for the current time', 403, 'NO_ACTIVE_SHIFT');
};

module.exports = { assertBuildingAcceptsEntry, assertStaffHasActiveShift };
