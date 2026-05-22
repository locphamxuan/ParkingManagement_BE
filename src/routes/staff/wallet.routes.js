const express = require("express");
const walletController = require("../../controllers/staff/wallet.controller");

const router = express.Router();

router.post("/", walletController.processWalletTransaction);

module.exports = router;