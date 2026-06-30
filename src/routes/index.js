const express = require("express");
const adminRoutes = require("./admin");
const managerRoutes = require("./manager");
const staffRoutes = require("./staff");
const userRoutes = require("./user");
const kioskRoutes = require("./kiosk.routes");

const router = express.Router();

router.use("/admin", adminRoutes);
router.use("/manager", managerRoutes);
router.use("/staff", staffRoutes);
router.use("/users", userRoutes);
router.use("/kiosk", kioskRoutes);

// NOTE: /payments/webhook is registered in app.js (PayOS uses JSON body, no raw-body constraint).

module.exports = router;
