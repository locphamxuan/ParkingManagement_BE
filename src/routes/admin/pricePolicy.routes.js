const express = require("express");
const controller = require("../../controllers/admin/pricePolicy.controller");
const { authenticate } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/rbac");
const { ROLES } = require("../../constants/roles");

const router = express.Router();

router.use(authenticate, authorize(ROLES.ADMIN));

router.get("/", controller.list);
router.post("/push", controller.push);
router.get("/push-logs", controller.listPushLogs);

module.exports = router;
