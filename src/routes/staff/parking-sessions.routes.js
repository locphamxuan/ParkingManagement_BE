const express = require('express');
const controller = require('../../controllers/staff/parkingSession.controller');
const { authorizeBuildingAccess } = require('../../middlewares/rbac');

const router = express.Router();

router.post('/check-in', authorizeBuildingAccess, controller.checkIn);
router.get('/active', controller.listActive);
router.get('/search', controller.search);
router.patch('/:id/check-out', controller.checkOut);
router.get('/:id', controller.getById);

module.exports = router;
