const express = require('express');
const { authenticate } = require('../../middlewares/auth.middleware');
const { authorize } = require('../../middlewares/rbac.middleware');
const { ROLES } = require('../../constants/roles');

const authRoutes = require('./auth.routes');
const profileRoutes = require('./profile.routes');
const licensePlateRoutes = require('./licensePlate.routes');
const parkingHistoryRoutes = require('./parkingHistory.routes');
const walletRoutes = require('./wallet.routes');
const longTermRoutes = require('./longTerm.routes');
const notificationRoutes = require('./notification.routes');
const feedbackRoutes = require('./feedback.routes');
const incidentRoutes = require('./incident.routes');
const buildingController = require('../../controllers/user/building.controller');
const router = express.Router();

router.use('/auth', authRoutes);
router.use('/feedbacks', feedbackRoutes);

// Public discovery endpoints. They expose only active building configuration
// and are used by the marketing pages before a customer signs in.
router.get('/buildings', buildingController.listBuildings);
router.get('/buildings/:buildingId/vehicle-types', buildingController.listVehicleTypes);
router.get('/buildings/:buildingId/floors', buildingController.listFloorsWithAvailability);
router.get('/buildings/:buildingId/floors/:floorId/slots', buildingController.listSlotsForFloor);
router.get('/buildings/:buildingId/violation-types', buildingController.listViolationTypes);

router.use(authenticate);

router.use(authorize(ROLES.USER));

router.use('/profile', profileRoutes);
router.use('/license-plates', licensePlateRoutes);
router.use('/parking-history', parkingHistoryRoutes);
router.use('/wallet', walletRoutes);
router.use('/long-term', longTermRoutes);
router.use('/notifications', notificationRoutes);
router.use('/incidents', incidentRoutes);

module.exports = router;
