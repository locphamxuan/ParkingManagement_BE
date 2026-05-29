const express = require('express');
const { handleWebhook } = require('../../controllers/payment/webhook.controller');

const router = express.Router();

/**
 * PayOS sends JSON — express.json() handles the body parsing.
 * No need for express.raw() (that was required by Stripe only).
 */
router.post('/', handleWebhook);

module.exports = router;
