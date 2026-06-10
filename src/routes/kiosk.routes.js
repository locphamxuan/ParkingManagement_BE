const express = require('express');
const kioskController = require('../controllers/kiosk.controller');

// Public gate-kiosk routes — no auth: a reservation driver self-admits by
// scanning the vehicle QR, without going through a staff member.
const router = express.Router();

router.post('/reservation-checkin', kioskController.reservationCheckIn);

module.exports = router;
