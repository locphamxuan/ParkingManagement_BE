const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/response');
const usersService = require('../../services/staff/users.service');

/**
 * GET /api/staff/users/lookup-qr/:qrCode?building=<id>
 * Lookup user by ID (qrCode is userID) within the selected building.
 * Returns the customer's display name + that building's active sessions/packages.
 */
const lookupQr = asyncHandler(async (req, res) => {
  const data = await usersService.lookupQr(req.user, req.params.qrCode, req.query.building || null);
  sendSuccess(res, { data });
});

/**
 * GET /api/staff/users/lookup-plate-qr/:qrCode?building=<id>
 * Lookup a license plate by its unique QR token (PLT-...) within the selected
 * building. Returns the scanned plate + that building's active sessions.
 */
const lookupPlateQr = asyncHandler(async (req, res) => {
  const data = await usersService.lookupPlateQr(req.user, req.params.qrCode, req.query.building || null);
  sendSuccess(res, { data });
});

/**
 * GET /api/staff/users/resolve-qr/:code?building=<id>
 * Unified QR resolver for the staff Camera 2 scanner — dispatches a PLT- plate
 * token or an account ObjectId to the right lookup, in the selected building.
 */
const resolveQr = asyncHandler(async (req, res) => {
  const data = await usersService.resolveQr(req.user, req.params.code, req.query.building || null);
  sendSuccess(res, { data });
});

module.exports = { lookupQr, lookupPlateQr, resolveQr };
