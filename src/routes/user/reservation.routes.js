const express = require('express');
const controller = require('../../controllers/user/reservation.controller');
const { validateCreateReservation } = require('../../validators/user/reservation.validator');

const router = express.Router();

router.get('/policy', controller.getPolicy);
router.get('/estimate', controller.estimate);
router.get('/', controller.list);
router.post('/', validateCreateReservation, controller.create);
router.get('/:id', controller.get);
router.delete('/:id', controller.cancel);

module.exports = router;
