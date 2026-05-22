const express = require("express");
const controller = require("../../controllers/admin/revenue.controller");
const { authenticate } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/rbac");
const { ROLES } = require("../../constants/roles");

const router = express.Router();

router.use(authenticate, authorize(ROLES.ADMIN));

router.get("/", controller.getReport);

module.exports = router;
