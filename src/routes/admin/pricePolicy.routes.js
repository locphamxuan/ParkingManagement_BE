const express = require("express");
const controller = require("../../controllers/admin/pricePolicy.controller");

const router = express.Router();

router.get("/", controller.list);
router.post("/push", controller.push);
router.get("/push-logs", controller.listPushLogs);

module.exports = router;
