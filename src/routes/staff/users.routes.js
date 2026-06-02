const express = require('express');
const usersController = require('../../controllers/staff/users.controller');

const router = express.Router();

// Lookup user by QR code (userID)
router.get('/lookup-qr/:qrCode', usersController.lookupQr);

module.exports = router;
