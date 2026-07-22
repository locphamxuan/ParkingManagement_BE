const ParkingSession = require('../../models/operations/ParkingSession');
const AppError = require('../../utils/AppError');

// FE (web + Mobile) map entryTime/exitTime → checkIn/checkOut và hiển thị
// slot/floor/gate/duration ngay trên danh sách (không riêng màn chi tiết) —
// populate đủ + tính duration ở đây để khớp field FE mong đợi.
const withDerivedFields = (session) => ({
  ...session,
  checkIn: session.entryTime,
  checkOut: session.exitTime,
  duration: session.exitTime
    ? Math.round((new Date(session.exitTime) - new Date(session.entryTime)) / 60000)
    : null,
});

const list = async (userId, query = {}) => {
  // Trang "Lịch sử gửi xe" hiển thị toàn bộ phiên gửi xe của user.
  const filter = { user: userId };
  if (query.buildingId) filter.building = query.buildingId;

  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);

  const [sessions, total] = await Promise.all([
    ParkingSession.find(filter)
      .sort('-entryTime')
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('building', 'name address')
      .populate('vehicleType', 'name')
      .populate('entryGate', 'code name')
      .populate('exitGate', 'code name')
      .populate({ path: 'slot', select: 'code floor', populate: { path: 'floor', select: 'name code' } })
      .lean(),
    ParkingSession.countDocuments(filter),
  ]);

  const items = sessions.map(withDerivedFields);

  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

// Scope theo user để không xem được phiên của người khác.
const getById = async (userId, id) => {
  const session = await ParkingSession.findOne({ _id: id, user: userId })
    .populate('building', 'name address')
    .populate('vehicleType', 'name')
    .populate('entryGate', 'code name')
    .populate('exitGate', 'code name')
    .populate({ path: 'slot', select: 'code floor', populate: { path: 'floor', select: 'name code' } })
    .lean();
  if (!session) throw new AppError('Parking session not found', 404, 'SESSION_NOT_FOUND');
  return withDerivedFields(session);
};

module.exports = { list, getById };
