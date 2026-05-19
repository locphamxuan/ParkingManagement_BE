const express = require("express");
const controller = require("../../controllers/admin/building.controller");
const { authorize } = require("../../middlewares/rbac");
const { authenticate } = require("../../middlewares/auth.middleware");
const {
  validateBuildingCreate,
  validateBuildingUpdate,
  validateBuildingStatus,
} = require("../../validators/building.validator");
const { ROLES } = require("../../constants/roles");

const router = express.Router();

router.use(authenticate, authorize(ROLES.ADMIN));

router.get("/", controller.listBuildings);
router.get("/:id", controller.getBuilding);
router.post("/", validateBuildingCreate, controller.createBuilding);
router.put("/:id", validateBuildingUpdate, controller.updateBuilding);
router.patch(
  "/:id/status",
  validateBuildingStatus,
  controller.updateBuildingStatus,
);
router.delete("/:id", controller.deleteBuilding);

const assignmentController = require("../../controllers/admin/assignment.controller");

router.post("/:buildingId/assign-manager", assignmentController.assignManager);
router.post("/:buildingId/revoke-manager", assignmentController.revokeManager);

module.exports = router;
