const express = require("express");
const buildingRoutes = require("./buildings.routes");
const userRoutes = require("./users.routes");
const auditRoutes = require("./audit.routes");
const dashboardRoutes = require("./dashboard.routes");

const router = express.Router();

router.use("/buildings", buildingRoutes);
router.use("/users", userRoutes);
router.use("/audit-logs", auditRoutes);
router.use("/dashboard", dashboardRoutes);

module.exports = router;
