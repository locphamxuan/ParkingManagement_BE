const express = require("express");
const parkingSessionController = require("../../controllers/staff/parkingSession.controller");
const { authorizeBuildingAccess } = require("../../middlewares/rbac.middleware");

const router = express.Router();

router.post("/check-in", authorizeBuildingAccess, parkingSessionController.checkIn);
router.get("/active", authorizeBuildingAccess, parkingSessionController.listActive);
router.get("/search", authorizeBuildingAccess, parkingSessionController.search);

// Plate lookup — returns hasAccount + user wallet info for staff at entry gate
router.get("/lookup-plate/:plate", authorizeBuildingAccess, parkingSessionController.lookupPlate);

// Free slots of a building (for assigning a long-term package vehicle at check-in)
router.get("/free-slots", authorizeBuildingAccess, parkingSessionController.listFreeSlots);

// Lịch sử xe vào hôm nay của nhân viên cổng vào — có location (cổng vào, tầng, ô đỗ)
router.get("/my-checkins", authorizeBuildingAccess, parkingSessionController.myCheckIns);

// AI camera (Camera 1) — recognize plate + brand from an image, resolve account
router.post("/scan", authorizeBuildingAccess, parkingSessionController.scan);

// Staff rejects a check-in/check-out → notify the plate owner
router.post("/reject", authorizeBuildingAccess, parkingSessionController.reject);

// Các route dưới được scope theo :id (session) / :orderCode (payment) — KHÔNG dùng
// authorizeBuildingAccess vì extractBuildingId sẽ nhầm params.id (sessionId/orderCode)
// thành buildingId rồi chặn nhầm. Controller tự assertBuildingScope theo session.
router.patch("/:id/check-out", parkingSessionController.checkOut);

// PayOS payment — tạo QR + checkoutUrl để thu phí gửi xe tại chỗ
router.post("/:id/initiate-payment", parkingSessionController.initiatePayment);

// Reconcile a bank-transfer (PayOS) payment when the webhook didn't arrive
router.get("/payment/:orderCode/status", parkingSessionController.verifyPayment);

router.get("/:id", parkingSessionController.getById);

module.exports = router;