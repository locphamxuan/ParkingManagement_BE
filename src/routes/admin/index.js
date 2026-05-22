const express = require("express");
const buildingRoutes = require("./buildings.routes");
const userRoutes = require("./users.routes");
const auditRoutes = require("./audit.routes");
const dashboardRoutes = require("./dashboard.routes");
const revenueRoutes = require("./revenue.routes");
const walletRoutes = require("./wallet.routes");
const pricePolicyRoutes = require("./pricePolicy.routes");

const router = express.Router();

router.use("/buildings", buildingRoutes);
router.use("/users", userRoutes);
router.use("/audit-logs", auditRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/revenue", revenueRoutes);
router.use("/wallet", walletRoutes);
router.use("/price-policies", pricePolicyRoutes);

module.exports = router;
