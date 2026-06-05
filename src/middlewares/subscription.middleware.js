const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { ROLES } = require('../constants/roles');
const subscriptionService = require('../services/manager/subscription.service');

/**
 * Block manager dashboard / resource access when the building has no active
 * admin-system subscription. Admins bypass. Managers without an active
 * subscription receive a 403 with errorCode 'SUBSCRIPTION_REQUIRED' so the
 * frontend can redirect them to purchase a package + top up their wallet.
 *
 * Must run AFTER authenticate + authorizeBuildingAccess (which resolve the user
 * and the :buildingId param). Wallet & subscription-status routes are mounted
 * BEFORE this gate so a manager can still pay to (re)activate.
 */
const requireActiveSubscription = asyncHandler(async (req, _res, next) => {
  if (req.user?.role === ROLES.ADMIN) return next();

  const buildingId = req.params.buildingId;
  if (!buildingId) {
    throw new AppError('buildingId is required', 400);
  }

  const active = await subscriptionService.hasActiveSubscription(buildingId);
  if (!active) {
    throw new AppError(
      'Your building does not have an active subscription. Purchase a package to access the dashboard.',
      403,
      'SUBSCRIPTION_REQUIRED',
    );
  }

  next();
});

module.exports = { requireActiveSubscription };
