const express = require('express');
const { handleWebhook } = require('../../controllers/payment/webhook.controller');
const { webhookLimiter } = require('../../middlewares/rateLimiter');

const router = express.Router();

/**
 * PayOS sends JSON — express.json() handles the body parsing.
 * No need for express.raw() (that was required by Stripe only).
 */
router.post('/', webhookLimiter, handleWebhook);

module.exports = router;
