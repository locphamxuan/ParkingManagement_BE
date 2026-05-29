const express = require("express");
const controller = require("../../controllers/admin/wallet.controller");

const router = express.Router();

router.get("/", controller.getWallet);
router.post("/topup", controller.topup);
router.post("/distribute", controller.distribute);
router.get("/distributions", controller.listDistributions);
router.get("/daily-transfers", controller.getDailyTransfers);

module.exports = router;
