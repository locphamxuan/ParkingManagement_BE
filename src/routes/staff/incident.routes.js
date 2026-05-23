const express = require("express");
const incidentController = require("../../controllers/staff/incident.controller");
const { validateIncidentReport } = require("../../validators/staff.validator");

const router = express.Router();

router.post("/", validateIncidentReport, incidentController.createIncidentReport);

module.exports = router;