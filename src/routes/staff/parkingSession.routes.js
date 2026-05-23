const express = require("express");
const parkingSessionController = require("../../controllers/staff/parkingSession.controller");
const { authorizeBuildingAccess } = require("../../middlewares/rbac.middleware");

const router = express.Router();

router.post("/check-in", authorizeBuildingAccess, parkingSessionController.checkIn);
router.get("/active", parkingSessionController.listActive);
router.get("/search", parkingSessionController.search);
router.patch("/:id/check-out", parkingSessionController.checkOut);
router.get("/:id", parkingSessionController.getById);

module.exports = router;