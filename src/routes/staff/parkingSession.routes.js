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

// Doanh thu ca của nhân viên cổng ra (tiền đã thu hôm nay) — đặt trước "/:id"
router.get("/my-shift-revenue", authorizeBuildingAccess, parkingSessionController.myShiftRevenue);

// Lịch sử xe vào hôm nay của nhân viên cổng vào — có location (cổng vào, tầng, ô đỗ)
router.get("/my-checkins", authorizeBuildingAccess, parkingSessionController.myCheckIns);

// AI camera (Camera 1) — recognize plate + brand from an image, resolve account
router.post("/scan", authorizeBuildingAccess, parkingSessionController.scan);

// Staff rejects a check-in/check-out → notify the plate owner
router.post("/reject", authorizeBuildingAccess, parkingSessionController.reject);

router.patch("/:id/check-out", authorizeBuildingAccess, parkingSessionController.checkOut);

// PayOS payment — tạo QR + checkoutUrl để thu phí gửi xe tại chỗ
router.post("/:id/initiate-payment", authorizeBuildingAccess, parkingSessionController.initiatePayment);

// Reconcile a bank-transfer (PayOS) payment when the webhook didn't arrive
router.get("/payment/:orderCode/status", authorizeBuildingAccess, parkingSessionController.verifyPayment);

router.get("/:id", authorizeBuildingAccess, parkingSessionController.getById);

module.exports = router;