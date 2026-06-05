const express = require("express");
const controller = require("../../controllers/admin/revenue.controller");

const router = express.Router();

router.get("/", controller.getReport);
router.get("/subscriptions", controller.getSubscriptionTransfers);

module.exports = router;
