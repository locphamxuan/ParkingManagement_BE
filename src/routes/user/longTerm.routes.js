const express = require('express');
const controller = require('../../controllers/user/longTerm.controller');
const { validateSubscribe } = require('../../validators/user/longTerm.validator');

const router = express.Router();

router.get('/packages', controller.listPackages);
router.post('/subscriptions', validateSubscribe, controller.subscribe);
router.get('/subscriptions', controller.listSubscriptions);
router.post('/subscriptions/:id/cancel', controller.cancelSubscription);

module.exports = router;
