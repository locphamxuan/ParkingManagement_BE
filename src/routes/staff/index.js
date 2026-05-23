const express = require("express");
const buildingAccessController = require("../../controllers/staff/buildingAccess.controller");
const { authenticate } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/rbac.middleware");
const { ROLES } = require("../../constants/roles");

const router = express.Router();

router.use(authenticate, authorize(ROLES.STAFF));

router.get("/dashboard", buildingAccessController.getDashboard);
router.get("/buildings", buildingAccessController.listAssignedBuildings);
router.get("/buildings/:id", buildingAccessController.getAssignedBuilding);

const parkingSessionRoutes = require("./parkingSession.routes");
const reservationRoutes = require("./reservation.routes");
const walletRoutes = require("./wallet.routes");
const incidentRoutes = require("./incident.routes");
const shiftRoutes = require("./shift.routes");

router.use("/parking-sessions", parkingSessionRoutes);
router.use("/reservations", reservationRoutes);
router.use("/wallet-transactions", walletRoutes);
router.use("/incidents", incidentRoutes);
router.use("/my-shifts", shiftRoutes);

module.exports = router;