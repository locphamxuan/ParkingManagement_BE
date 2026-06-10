const { StaffShift } = require('../../models');
const { assignedBuildingIds } = require('../../utils/staffScope');

const listMyShifts = async (user, query = {}) => {
  const filter = { staff: user._id };

  if (query.from || query.to) {
    filter.workDate = {};
    if (query.from) filter.workDate.$gte = new Date(query.from);
    if (query.to) filter.workDate.$lte = new Date(query.to);
  }
  if (query.status) filter.status = query.status;
  if (query.building) {
    const allowed = assignedBuildingIds(user);
    if (allowed.includes(`${query.building}`)) {
      filter.building = query.building;
    }
  }

  return StaffShift.find(filter)
    .populate('shift', 'code name startTime endTime')
    .populate('building', 'name code')
    .populate('gate', 'code name direction status')
    .sort({ workDate: -1 });
};

module.exports = { listMyShifts };
