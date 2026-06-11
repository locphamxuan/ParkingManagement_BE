const webhookService = require('../../services/payment/webhook.service');
const logger = require("../../utils/logger");

/**
 * POST /api/payments/webhook
 *
 * PayOS sends a JSON body (unlike Stripe which needs raw bytes).
 * express.json() must have already parsed req.body before this handler runs.
 */
const handleWebhook = async (req, res) => {
  try {
    await webhookService.handle(req.body);
    res.json({ success: true });
  } catch (err) {
    logger.error('[PayOS Webhook]', err.message);
    res.status(err.statusCode || 400).json({ success: false, error: err.message });
  }
};

module.exports = { handleWebhook };
