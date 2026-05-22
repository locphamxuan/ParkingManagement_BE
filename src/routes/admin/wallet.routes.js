const express = require("express");
const controller = require("../../controllers/admin/wallet.controller");
const { authenticate } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/rbac");
const { ROLES } = require("../../constants/roles");

const router = express.Router();

router.use(authenticate, authorize(ROLES.ADMIN));

router.get("/", controller.getWallet);
router.post("/topup", controller.topup);
router.post("/distribute", controller.distribute);
router.get("/distributions", controller.listDistributions);

module.exports = router;
