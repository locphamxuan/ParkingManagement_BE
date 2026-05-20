const express = require("express");
const controller = require("../../controllers/admin/dashboard.controller");
const { authenticate } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/rbac");
const { ROLES } = require("../../constants/roles");

const router = express.Router();

router.use(authenticate, authorize(ROLES.ADMIN));

router.get("/", controller.getOverview);

module.exports = router;
