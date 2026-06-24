const { StaffShift, Payment } = require('../../models');
const AppError = require('../../utils/AppError');
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

const submitShiftReport = async (user, shiftId) => {
  const staffShift = await StaffShift.findOne({ _id: shiftId, staff: user._id })
    .populate('shift', 'code name startTime endTime')
    .populate('building', 'name code')
    .populate('gate', 'code name direction');
  if (!staffShift) throw new AppError('Shift not found', 404);

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const payments = await Payment.find({
    building: staffShift.building,
    staff: user._id,
    type: 'session',
    status: 'success',
    createdAt: { $gte: start, $lte: end },
  }).lean();

  let total = 0, cash = 0, wallet = 0, online = 0;
  for (const p of payments) {
    total += p.amount || 0;
    if (p.method === 'cash') cash += p.amount || 0;
    else if (p.method === 'wallet') wallet += p.amount || 0;
    else online += p.amount || 0;
  }

  staffShift.revenueReport = {
    submittedAt: new Date(),
    total,
    count: payments.length,
    byMethod: { cash, wallet, online },
  };
  await staffShift.save();
  return staffShift;
};

module.exports = { listMyShifts, submitShiftReport };
