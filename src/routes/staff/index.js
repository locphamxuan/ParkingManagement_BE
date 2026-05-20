const express = require("express");
const controller = require("../../controllers/staff.controller");
const { authenticate } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/rbac");
const { ROLES } = require("../../constants/roles");

const router = express.Router();

router.use(authenticate, authorize(ROLES.STAFF));

router.get("/dashboard", controller.getDashboard);
router.get("/buildings", controller.listAssignedBuildings);
router.get("/buildings/:id", controller.getAssignedBuilding);

module.exports = router;