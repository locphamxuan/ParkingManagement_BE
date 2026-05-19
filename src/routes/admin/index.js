const express = require("express");
const buildingRoutes = require("./buildings.routes");

const router = express.Router();

router.use("/buildings", buildingRoutes);

module.exports = router;
