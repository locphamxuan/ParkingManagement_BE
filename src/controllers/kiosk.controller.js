const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const kioskService = require('../services/kiosk.service');

/**
 * POST /api/kiosk/reservation-checkin
 * Self-service gate check-in for a reservation, identified by the vehicle QR
 * (PLT-...) or plate number. No staff / auth required — the gate device calls it.
 * Body: { qrCode?, plateNumber?, gate?, plateImage?, portraitImage? }
 */
const reservationCheckIn = asyncHandler(async (req, res) => {
  const result = await kioskService.selfCheckInByQr(req.body || {});
  sendSuccess(res, { message: 'Xe đặt chỗ đã vào bãi tự động thành công', data: result });
});

module.exports = { reservationCheckIn };
