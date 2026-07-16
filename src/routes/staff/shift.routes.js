const express = require('express');
const shiftController = require('../../controllers/staff/shift.controller');

const router = express.Router();

router.get('/', shiftController.listMyShifts);

module.exports = router;
