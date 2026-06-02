const express = require('express');
const controller = require('../../controllers/user/wallet.controller');
const { validateTopup } = require('../../validators/user/wallet.validator');

const router = express.Router();

router.get('/', controller.getWallet);
router.post('/topup', validateTopup, controller.topup);
router.get('/topup/:orderCode/status', controller.verifyTopup);
router.get('/transactions', controller.listTransactions);

module.exports = router;
