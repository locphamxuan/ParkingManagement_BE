const crypto = require('crypto');
const env = require('../config/env');
const AppError = require('../utils/AppError');

const requireKioskDevice = (req, res, next) => {
  const configuredToken = env.kioskDeviceToken;
  if (!configuredToken) {
    return next(new AppError(
      'Kiosk check-in is not configured. Set KIOSK_DEVICE_TOKEN on the gate device and API.',
      503,
      'KIOSK_NOT_CONFIGURED',
    ));
  }

  const suppliedToken = `${req.get('x-kiosk-device-token') || ''}`;
  const expected = Buffer.from(configuredToken);
  const supplied = Buffer.from(suppliedToken);
  if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) {
    return next(new AppError('Unauthorized kiosk device', 401, 'KIOSK_DEVICE_UNAUTHORIZED'));
  }
  return next();
};

module.exports = { requireKioskDevice };
