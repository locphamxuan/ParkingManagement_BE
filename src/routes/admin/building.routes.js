const express = require("express");
const controller = require("../../controllers/admin/building.controller");
const {
  validateBuildingCreate,
  validateBuildingUpdate,
  validateBuildingStatus,
} = require("../../validators/building.validator");

const router = express.Router();

router.get("/", controller.listBuildings);
router.get("/:id/members", controller.getBuildingMembers);
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
router.post("/:buildingId/assign-staff", assignmentController.assignStaff);
router.post("/:buildingId/revoke-staff", assignmentController.revokeStaff);

module.exports = router;
