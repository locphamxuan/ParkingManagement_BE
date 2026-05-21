const express = require('express');
const controller = require('../../controllers/staff/parkingSession.controller');
const { authorizeBuildingAccess } = require('../../middlewares/rbac');

const router = express.Router();

router.post('/check-in', authorizeBuildingAccess, controller.checkIn);
router.patch('/:id/check-out', authorizeBuildingAccess, controller.checkOut);
router.get('/active', controller.listActive);
router.get('/:id', controller.getById);
router.get('/search', controller.search);

module.exports = router;
