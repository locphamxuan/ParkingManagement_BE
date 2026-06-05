const express = require('express');
const ctrl = require('../../controllers/admin/subscriptionPackage.controller');

const router = express.Router();

router.get('/', ctrl.listPackages);
router.get('/:id', ctrl.getPackage);
router.post('/', ctrl.createPackage);
router.put('/:id', ctrl.updatePackage);
router.delete('/:id', ctrl.deletePackage);

module.exports = router;
