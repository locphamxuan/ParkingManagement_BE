const express = require("express");
const buildingRoutes = require("./building.routes");

const router = express.Router();

router.use("/building", buildingRoutes);

module.exports = router;
