const express = require("express");
const { authenticate } = require("../../middlewares/auth.middleware");
const { authorize, authorizeBuildingAccess } = require("../../middlewares/rbac.middleware");
const { ROLES } = require("../../constants/roles");

const vehicleTypeController = require("../../controllers/manager/vehicleType.controller");
const floorController = require("../../controllers/manager/floor.controller");
const gateController = require("../../controllers/manager/gate.controller");
const slotController = require("../../controllers/manager/slot.controller");
const zoneController = require("../../controllers/manager/zone.controller");
const pricingController = require("../../controllers/manager/pricing.controller");
const packageController = require("../../controllers/manager/package.controller");
const reservationPolicyController = require("../../controllers/manager/reservationPolicy.controller");
const shiftController = require("../../controllers/manager/shift.controller");
const feedbackController = require("../../controllers/manager/feedback.controller");
const dashboardController = require("../../controllers/manager/dashboard.controller");
const buildingWalletController = require("../../controllers/manager/buildingWallet.controller");
const buildingController = require("../../controllers/manager/building.controller");

const v = require("../../validators/manager.validator");

const router = express.Router({ mergeParams: true });

router.use(
  authenticate,
  authorize(ROLES.MANAGER, ROLES.ADMIN),
  authorizeBuildingAccess
);

// ── Building Wallet ─ (gom doanh thu gửi xe của tòa nhà) ─────────────────────────
router.get("/wallet", buildingWalletController.getWallet);
router.get("/wallet/transactions", buildingWalletController.listTransactions);
router.get("/wallet/daily-revenue", buildingWalletController.getDailyRevenue);
router.get("/wallet/revenue-breakdown", buildingWalletController.getRevenueBreakdown);

// Giờ mở/đóng cửa của tòa nhà.
router.put("/operating-hours", buildingController.updateOperatingHours);
// PayOS top-up for building wallet
router.post("/wallet/topup", buildingWalletController.initiateTopup);
router.get("/wallet/topup/:orderCode/verify", buildingWalletController.verifyTopup);

router.get("/dashboard", dashboardController.getOverview);

router
  .route("/vehicle-types")
  .get(vehicleTypeController.list)
  .post(v.validateVehicleType, vehicleTypeController.create);
router
  .route("/vehicle-types/:id")
  .put(v.validateVehicleType, vehicleTypeController.update)
  .delete(vehicleTypeController.remove);

router
  .route("/floors")
  .get(floorController.list)
  .post(v.validateFloor, floorController.create);
router
  .route("/floors/:id")
  .get(floorController.get)
  .put(v.validateFloor, floorController.update)
  .delete(floorController.remove);

// Manager CRUD cổng và tự đặt thể loại (ra / vào / hai chiều).
router
  .route("/gates")
  .get(gateController.list)
  .post(v.validateGate, gateController.create);
router
  .route("/gates/:id")
  .put(v.validateGate, gateController.update)
  .delete(gateController.remove);
router.patch("/gates/:id/status", gateController.updateStatus);

// Dãy (Zone) — nguồn cấu hình loại xe + đối tượng sử dụng cho các slot bên trong.
router
  .route("/zones")
  .get(zoneController.list)
  .post(v.validateZone, zoneController.create);
router
  .route("/zones/:id")
  .put(v.validateZone, zoneController.update)
  .delete(zoneController.remove);

router
  .route("/slots")
  .get(slotController.list)
  .post(v.validateSlot, slotController.create);
// Tạo hàng loạt — phải khai báo trước /slots/:id để "batch" không bị nuốt làm :id.
router.post("/slots/batch", v.validateSlotBatch, slotController.createBatch);
router
  .route("/slots/:id")
  .put(v.validateSlot, slotController.update)
  .delete(slotController.remove);
router.patch(
  "/slots/:id/status",
  v.validateSlotStatus,
  slotController.updateStatus
);

router
  .route("/price-policies")
  .get(pricingController.list)
  .post(v.validatePricePolicy, pricingController.create);
router
  .route("/price-policies/:id")
  .put(v.validatePricePolicy, pricingController.update)
  .delete(pricingController.deactivate);

router
  .route("/packages")
  .get(packageController.listPackages)
  .post(v.validatePackage, packageController.createPackage);
router
  .route("/packages/:id")
  .put(v.validatePackage, packageController.updatePackage)
  .delete(packageController.removePackage);
router.get("/subscriptions", packageController.listSubscriptions);
router.delete("/subscriptions/:id", packageController.cancelSubscription);

router
  .route("/reservation-policy")
  .get(reservationPolicyController.get)
  .put(v.validateReservationPolicy, reservationPolicyController.upsert);

router
  .route("/shifts")
  .get(shiftController.listShifts)
  .post(v.validateShift, shiftController.createShift);
router
  .route("/shifts/:id")
  .put(v.validateShift, shiftController.updateShift)
  .delete(shiftController.removeShift);

router
  .route("/staff-shifts")
  .get(shiftController.listStaffShifts)
  .post(v.validateStaffShift, shiftController.assignStaffShift);
router
  .route("/staff-shifts/:id")
  .put(shiftController.updateStaffShift)
  .delete(shiftController.removeStaffShift);
router.get("/staff", shiftController.listAvailableStaff);
router.get("/shift-revenues", shiftController.listShiftRevenues);
router.get("/shift-report-submissions", shiftController.listShiftReportSubmissions);

router.get("/feedbacks", feedbackController.list);
router.patch(
  "/feedbacks/:id",
  v.validateFeedbackResponse,
  feedbackController.respond
);

module.exports = router;
