const express = require('express');
const usersController = require('../../controllers/staff/users.controller');

const router = express.Router();

// Mọi route QR bên dưới BẮT BUỘC có ?building=<id> và staff phải được phân công
// đúng tòa đó — không có fallback "tất cả tòa được phân quyền".

// Lookup user by QR code (userID), scoped to ?building
router.get('/lookup-qr/:qrCode', usersController.lookupQr);

// Lookup a license plate by its unique QR token (PLT-...), scoped to ?building
router.get('/lookup-plate-qr/:qrCode', usersController.lookupPlateQr);

// Unified QR resolver for the staff Camera 2 scanner (PLT- token or account ID),
// scoped to ?building
router.get('/resolve-qr/:code', usersController.resolveQr);

module.exports = router;
