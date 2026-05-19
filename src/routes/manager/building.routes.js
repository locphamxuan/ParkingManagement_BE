const express = require("express");
const controller = require("../../controllers/manager/building.controller");
const { authenticate } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/rbac");
const { ROLES } = require("../../constants/roles");
const {
  validateManagerBuildingUpdate,
} = require("../../validators/building.validator");

const router = express.Router();

router.use(authenticate, authorize(ROLES.MANAGER));

router.get("/", controller.getBuilding);
router.put("/:id", validateManagerBuildingUpdate, controller.updateBuilding);

module.exports = router;
