const express = require("express");
const controller = require("../../controllers/admin/revenue.controller");

const router = express.Router();

router.get("/transactions", controller.listPayments);
router.get("/reconciliation", controller.getReconciliation);
router.get("/", controller.getReport);

module.exports = router;
