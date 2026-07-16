const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const kioskService = require('../services/kiosk.service');

/**
 * POST /api/kiosk/package-checkin
 * Self-service gate check-in for a long-term package holder, identified ONLY by the
 * registered vehicle QR token (PLT-...). No staff / auth required — the gate device
 * calls it. Body: { qrCode, gate?, building?, plateImage?, portraitImage? }
 */
const packageCheckIn = asyncHandler(async (req, res) => {
  const result = await kioskService.selfCheckInByQr(req.body || {});
  sendSuccess(res, { message: 'Xe gói dài hạn đã vào bãi tự động thành công', data: result });
});

module.exports = { packageCheckIn };
