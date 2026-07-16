const { StaffShift } = require('../../models');
const { assignedBuildingIds } = require('../../utils/staffScope');

const listMyShifts = async (user, query = {}) => {
  const filter = { staff: user._id };

  if (query.workDate) {
    // Lọc đúng 1 ngày (YYYY-MM-DD): FE trang doanh thu dựa vào đây để lấy CA HÔM NAY.
    const dayStart = new Date(query.workDate); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(query.workDate); dayEnd.setHours(23, 59, 59, 999);
    filter.workDate = { $gte: dayStart, $lte: dayEnd };
  } else if (query.from || query.to) {
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
