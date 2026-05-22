const express = require("express");
const incidentController = require("../../controllers/staff/incident.controller");

const router = express.Router();

router.post("/", incidentController.createIncidentReport);

module.exports = router;