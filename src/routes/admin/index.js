const express = require("express");
const { authenticate } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/rbac.middleware");
const { ROLES } = require("../../constants/roles");

const buildingRoutes = require("./building.routes");
const userRoutes = require("./user.routes");
const auditRoutes = require("./audit.routes");
const dashboardRoutes = require("./dashboard.routes");
const revenueRoutes = require("./revenue.routes");
const pricePolicyRoutes = require("./pricePolicy.routes");

const router = express.Router();

router.use(authenticate, authorize(ROLES.ADMIN));

router.use("/buildings", buildingRoutes);
router.use("/users", userRoutes);
router.use("/audit-logs", auditRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/revenue", revenueRoutes);
router.use("/price-policies", pricePolicyRoutes);

module.exports = router;
