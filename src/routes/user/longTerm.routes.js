const express = require('express');
const controller = require('../../controllers/user/longTerm.controller');
const { validateSubscribe, validateRenew } = require('../../validators/user/longTerm.validator');

const router = express.Router();

router.get('/packages', controller.listPackages);
router.post('/subscriptions', validateSubscribe, controller.subscribe);
router.get('/subscriptions', controller.listSubscriptions);
router.post('/subscriptions/:id/cancel', controller.cancelSubscription);
router.post('/subscriptions/:id/renew', validateRenew, controller.renewSubscription);

module.exports = router;
