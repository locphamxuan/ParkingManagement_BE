const express = require("express");
const { authenticate } = require("../../middlewares/auth.middleware");
const { authorize, readOnlyForAdmin } = require("../../middlewares/rbac.middleware");
const { ROLES } = require("../../constants/roles");

const buildingController = require("../../controllers/manager/building.controller");
const {
  validateManagerBuildingUpdate,
} = require("../../validators/building.validator");

const resourceRoutes = require("./buildingResources.routes");

const router = express.Router();

router.use(authenticate, authorize(ROLES.MANAGER, ROLES.ADMIN), readOnlyForAdmin);

router.get("/buildings", buildingController.getBuilding);
router.put("/buildings/:id", validateManagerBuildingUpdate, buildingController.updateBuilding);

router.use("/buildings/:buildingId", resourceRoutes);

module.exports = router;
