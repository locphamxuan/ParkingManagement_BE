const express = require('express');
const controller = require('../../controllers/user/parkingHistory.controller');

const router = express.Router();

router.get('/', controller.list);
router.get('/:id', controller.get);

module.exports = router;
