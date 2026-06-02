const express = require("express");
const walletController = require("../../controllers/staff/wallet.controller");
const { validateWalletTransaction } = require("../../validators/staff.validator");

const router = express.Router();

router.post("/", validateWalletTransaction, walletController.processWalletTransaction);

module.exports = router;