const express = require('express');
const controller = require('../../controllers/user/vehicle.controller');
const {
  validateCreateVehicle,
  validateUpdateVehicle,
} = require('../../validators/user/vehicle.validator');

const router = express.Router();

router.get('/', controller.list);
router.post('/', validateCreateVehicle, controller.add);
router.get('/:vehicleId', controller.getOne);
router.put('/:vehicleId', validateUpdateVehicle, controller.update);
router.delete('/:vehicleId', controller.remove);
router.patch('/:vehicleId/default', controller.setDefault);
// Chủ xe chủ động huỷ mã cũ và lấy mã mới (vd nghi bị chụp trộm).
router.post('/:vehicleId/qr/refresh', controller.refreshQr);

module.exports = router;
