const express = require('express');
const controller = require('../../controllers/user/licensePlate.controller');
const { validateAddPlate, validateUpdatePlate } = require('../../validators/user/licensePlate.validator');

const router = express.Router();

router.get('/', controller.list);
router.post('/', validateAddPlate, controller.add);
router.put('/:plateId', validateUpdatePlate, controller.update);
router.delete('/:plateId', controller.remove);
router.patch('/:plateId/default', controller.setDefault);

module.exports = router;
