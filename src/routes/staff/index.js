const express = require("express");
const buildingAccessController = require("../../controllers/staff/buildingAccess.controller");
const { authenticate } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/rbac.middleware");
const { ROLES } = require("../../constants/roles");

const router = express.Router();

router.use(authenticate);

router.use(authorize(ROLES.STAFF));

router.get("/dashboard", buildingAccessController.getDashboard);
router.get("/buildings", buildingAccessController.listAssignedBuildings);
router.get("/buildings/:id", buildingAccessController.getAssignedBuilding);

const parkingSessionRoutes = require("./parkingSession.routes");
const walletRoutes = require("./wallet.routes");
const incidentRoutes = require("./incident.routes");
const shiftRoutes = require("./shift.routes");
const usersRoutes = require("./users.routes");

router.use("/parking-sessions", parkingSessionRoutes);
router.use("/wallet-transactions", walletRoutes);
router.use("/incidents", incidentRoutes);
router.use("/my-shifts", shiftRoutes);
router.use("/users", usersRoutes);

const refundPolicyService = require("../../services/manager/refundPolicy.service");
const { wrapResponse } = require("../../utils/response");

router.get("/buildings/:id/policy", async (req, res, next) => {
  try {
    const policy = await refundPolicyService.getPublic(req.params.id);
    return res.json(wrapResponse(policy));
  } catch (err) {
    next(err);
  }
});



module.exports = router;
