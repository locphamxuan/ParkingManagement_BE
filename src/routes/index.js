const express = require("express");
const adminRoutes = require("./admin");
const managerRoutes = require("./manager");
const staffRoutes = require("./staff");
const userRoutes = require("./user");

const router = express.Router();

router.use("/admin", adminRoutes);
router.use("/manager", managerRoutes);
router.use("/staff", staffRoutes);
router.use("/users", userRoutes);

module.exports = router;
