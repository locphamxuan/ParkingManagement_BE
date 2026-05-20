const express = require("express");
const { authenticate } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/rbac");
const { ROLES } = require("../../constants/roles");

const buildingController = require("../../controllers/manager/building.controller");
const {
  validateManagerBuildingUpdate,
} = require("../../validators/building.validator");

const resourceRoutes = require("./resources.routes");

const router = express.Router();

router.get(
  "/buildings",
  authenticate,
  authorize(ROLES.MANAGER, ROLES.ADMIN),
  buildingController.getBuilding
);
router.put(
  "/buildings/:id",
  authenticate,
  authorize(ROLES.MANAGER, ROLES.ADMIN),
  validateManagerBuildingUpdate,
  buildingController.updateBuilding
);

router.use("/buildings/:buildingId", resourceRoutes);

router.get(
  "/building",
  authenticate,
  authorize(ROLES.MANAGER, ROLES.ADMIN),
  buildingController.getBuilding
);
router.put(
  "/building/:id",
  authenticate,
  authorize(ROLES.MANAGER, ROLES.ADMIN),
  validateManagerBuildingUpdate,
  buildingController.updateBuilding
);

module.exports = router;
