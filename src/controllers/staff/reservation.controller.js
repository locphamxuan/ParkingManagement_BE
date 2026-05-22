const asyncHandler = require("../../utils/asyncHandler");
const { sendSuccess } = require("../../utils/response");
const reservationService = require("../../services/staff/reservation.service");

const checkInReservation = asyncHandler(async (req, res) => {
  const { code } = req.params;
  const { building, gate, vehicleType } = req.body;
  const staffId = req.user._id;

  const result = await reservationService.processReservationCheckIn({
    bookingCode: code,
    buildingId: building,
    gate,
    vehicleType,
    staffId
  });

  sendSuccess(res, "Xác nhận xe đặt chỗ vào bãi thành công", result);
});

const expireReservation = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const staffId = req.user._id;

  const result = await reservationService.expireReservation({
    reservationId: id,
    staffId
  });

  sendSuccess(res, "Hủy và giải phóng lượt đặt chỗ quá hạn thành công", result);
});

module.exports = {
  checkInReservation,
  expireReservation,
};