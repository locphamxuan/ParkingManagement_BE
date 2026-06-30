const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/response');
const usersService = require('../../services/staff/users.service');

/**
 * GET /api/staff/users/lookup-qr/:qrCode
 * Lookup user by ID (qrCode is userID).
 * Returns user info + active parking sessions.
 */
const lookupQr = asyncHandler(async (req, res) => {
  const data = await usersService.lookupQr(req.user, req.params.qrCode);
  sendSuccess(res, { data });
});

/**
 * GET /api/staff/users/lookup-plate-qr/:qrCode
 * Lookup a license plate by its unique QR token (PLT-...).
 * Returns the plate, its owner, and the owner's active parking sessions.
 */
const lookupPlateQr = asyncHandler(async (req, res) => {
  const data = await usersService.lookupPlateQr(req.user, req.params.qrCode);
  sendSuccess(res, { data });
});

/**
 * GET /api/staff/users/resolve-qr/:code
 * Unified QR resolver for the staff Camera 2 scanner — dispatches a PLT- plate
 * token or an account ObjectId to the right lookup.
 */
const resolveQr = asyncHandler(async (req, res) => {
  const buildingId = req.query.building || null;
  const data = await usersService.resolveQr(req.user, req.params.code, buildingId);
  sendSuccess(res, { data });
});

module.exports = { lookupQr, lookupPlateQr, resolveQr };
