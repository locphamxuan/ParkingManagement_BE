const express = require('express');
const usersController = require('../../controllers/staff/users.controller');

const router = express.Router();

// Lookup user by QR code (userID)
router.get('/lookup-qr/:qrCode', usersController.lookupQr);

// Lookup a license plate by its unique QR token (PLT-...)
router.get('/lookup-plate-qr/:qrCode', usersController.lookupPlateQr);

// Unified QR resolver for the staff Camera 2 scanner (PLT- token or account ID)
router.get('/resolve-qr/:code', usersController.resolveQr);

module.exports = router;
