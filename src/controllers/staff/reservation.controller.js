const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/response');
const reservationService = require('../../services/staff/reservation.service');

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

module.exports = { checkInReservation, expireReservation };
