const express = require('express');
const controller = require('../../controllers/admin/governance.controller');

const router = express.Router();
router.get('/roles', controller.getRoleCatalog);

module.exports = router;
