const express = require('express');
const usersController = require('../../controllers/staff/users.controller');

const router = express.Router();

// Lookup user by QR code (userID)
router.get('/lookup-qr/:qrCode', usersController.lookupQr);

// Lookup a license plate by its unique QR token (PLT-...)
router.get('/lookup-plate-qr/:qrCode', usersController.lookupPlateQr);

module.exports = router;
