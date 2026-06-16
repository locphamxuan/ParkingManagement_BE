const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const kioskService = require('../services/kiosk.service');

/**
 * POST /api/kiosk/reservation-checkin
 * Self-service gate check-in for a reservation, identified ONLY by the registered
 * vehicle QR token (PLT-...). No staff / auth required — the gate device calls it.
 * Body: { qrCode, gate?, plateImage?, portraitImage? }
 */
const reservationCheckIn = asyncHandler(async (req, res) => {
  const result = await kioskService.selfCheckInByQr(req.body || {});
  sendSuccess(res, { message: 'Xe đặt chỗ đã vào bãi tự động thành công', data: result });
});

module.exports = { reservationCheckIn };
