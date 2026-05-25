const express = require('express');
const { authenticate } = require('../../middlewares/auth.middleware');
const { authorize } = require('../../middlewares/rbac.middleware');
const { ROLES } = require('../../constants/roles');

const authRoutes = require('./auth.routes');
const profileRoutes = require('./profile.routes');
const licensePlateRoutes = require('./licensePlate.routes');
const reservationRoutes = require('./reservation.routes');
const parkingHistoryRoutes = require('./parkingHistory.routes');
const walletRoutes = require('./wallet.routes');
const longTermRoutes = require('./longTerm.routes');
const router = express.Router();

router.use('/auth', authRoutes);

router.use(authenticate, authorize(ROLES.USER));

router.use('/profile', profileRoutes);
router.use('/license-plates', licensePlateRoutes);
router.use('/reservations', reservationRoutes);
router.use('/parking-history', parkingHistoryRoutes);
router.use('/wallet', walletRoutes);
router.use('/long-term', longTermRoutes);

module.exports = router;
