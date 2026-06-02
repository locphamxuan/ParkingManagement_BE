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

module.exports = { lookupQr };
