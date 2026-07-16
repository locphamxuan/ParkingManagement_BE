const express = require('express');
const controller = require('../../controllers/user/incident.controller');

const router = express.Router();

// User báo cáo sự cố + xem danh sách sự cố của mình.
router.post('/', controller.createIncident);
router.get('/me', controller.listMyIncidents);

module.exports = router;
