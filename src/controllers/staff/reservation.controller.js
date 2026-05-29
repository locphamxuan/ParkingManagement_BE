const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/response');
const reservationService = require('../../services/staff/reservation.service');
const Reservation = require('../../models/operations/Reservation');
const Payment = require('../../models/finance/Payment');
const { ensureStaffHasBuilding } = require('../../utils/staffScope');

// Staff xem danh sách reservation của building mình được gán
const listReservations = asyncHandler(async (req, res) => {
  const buildingId = ensureStaffHasBuilding(req.user);
  const { status, date, page = 1, limit = 50 } = req.query;

  const filter = { building: buildingId };
  if (status) filter.status = status;
  if (date) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    filter.startTime = { $gte: start, $lte: end };
  }

  const pageNum = Math.max(Number(page) || 1, 1);
  const limitNum = Math.min(Math.max(Number(limit) || 50, 1), 100);

  const [items, total] = await Promise.all([
    Reservation.find(filter)
      .sort({ startTime: 1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .populate('user', 'fullName email phone')
      .populate('vehicleType', 'name code')
      .populate({ path: 'slot', select: 'code floor', populate: { path: 'floor', select: 'code name' } })
      .lean(),
    Reservation.countDocuments(filter),
  ]);

  // Real amount paid = sum of successful reservation payments (reflects the actual
  // money charged, not the reservation.fee field which is empty on older records).
  const ids = items.map((r) => r._id);
  const paidRows = ids.length
    ? await Payment.aggregate([
        { $match: { reservation: { $in: ids }, type: 'reservation', status: 'success' } },
        { $group: { _id: '$reservation', total: { $sum: '$amount' } } },
      ])
    : [];
  const paidMap = new Map(paidRows.map((p) => [String(p._id), p.total]));

  const itemsOut = items.map((r) => ({
    ...r,
    amountPaid: paidMap.get(String(r._id)) ?? (Number(r.fee) || 0),
  }));

  sendSuccess(res, {
    data: {
      items: itemsOut,
      pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
    },
  });
});

const checkInReservation = asyncHandler(async (req, res) => {
  const result = await reservationService.processReservationCheckIn(req.user, {
    code: req.params.code,
    entryGate: req.body.gate,
  });
  sendSuccess(res, { message: 'Xác nhận xe đặt chỗ vào bãi thành công', data: result });
});

const expireReservation = asyncHandler(async (req, res) => {
  const result = await reservationService.expireReservation(req.user, { id: req.params.id });
  sendSuccess(res, { message: 'Hủy và giải phóng lượt đặt chỗ quá hạn thành công', data: result });
});

module.exports = { listReservations, checkInReservation, expireReservation };
