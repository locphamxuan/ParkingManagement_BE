const express = require('express');
const shiftController = require('../../controllers/staff/shift.controller');

const router = express.Router();

router.get('/', shiftController.listMyShifts);
router.post('/:id/submit-report', shiftController.submitShiftReport);

module.exports = router;
