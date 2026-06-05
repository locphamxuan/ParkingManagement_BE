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
const pricePolicyController = require("../../controllers/admin/pricePolicy.controller");

router.post("/:buildingId/assign-manager", assignmentController.assignManager);
router.post("/:buildingId/revoke-manager", assignmentController.revokeManager);
router.post("/:buildingId/assign-staff", assignmentController.assignStaff);
router.post("/:buildingId/revoke-staff", assignmentController.revokeStaff);

// Admin manually grants / revokes a building's admin-system subscription.
router.post("/:id/subscription/grant", controller.grantSubscription);
router.post("/:id/subscription/revoke", controller.revokeSubscription);

// Admin xem bảng giá của building (read-only)
router.get("/:id/price-policies", pricePolicyController.listByBuilding);
// Admin xem gói dài hạn của building (read-only)
router.get("/:id/packages", controller.listBuildingPackages);

module.exports = router;
