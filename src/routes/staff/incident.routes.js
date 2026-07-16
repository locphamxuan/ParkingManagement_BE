const express = require('express');
const incidentController = require('../../controllers/staff/incident.controller');
const {
  validateCreateIncident,
  validateListIncidentsQuery,
} = require('../../validators/staff.validator');

const router = express.Router();

// GET  /staff/incidents?buildingId=&status=&severity=&page=&limit=
router.get('/', validateListIncidentsQuery, incidentController.listIncidents);

// POST /staff/incidents
router.post('/', validateCreateIncident, incidentController.createIncident);

// PATCH /staff/incidents/:id — xử lý sự cố (đổi trạng thái / xử lý vi phạm)
router.patch('/:id', incidentController.updateIncident);

module.exports = router;
