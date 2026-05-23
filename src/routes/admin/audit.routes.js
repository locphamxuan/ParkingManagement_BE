const express = require("express");
const controller = require("../../controllers/admin/audit.controller");

const router = express.Router();

router.get("/", controller.list);

module.exports = router;
