const express = require('express');
const kioskController = require('../controllers/kiosk.controller');
const { kioskLimiter } = require('../middlewares/rateLimiter');
const { requireKioskDevice } = require('../middlewares/kioskDevice.middleware');

// Public gate-kiosk routes — no auth: a long-term package driver self-admits by
// scanning the vehicle QR, without going through a staff member.
const router = express.Router();

router.post('/package-checkin', kioskLimiter, requireKioskDevice, kioskController.packageCheckIn);

module.exports = router;
