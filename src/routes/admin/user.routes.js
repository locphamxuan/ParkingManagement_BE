const express = require("express");
const controller = require("../../controllers/admin/user.controller");
const { validateUserStatus } = require("../../validators/adminUsers.validator");

const router = express.Router();

router.get("/", controller.list);
router.get("/:id", controller.get);
router.post("/", controller.create);
router.put("/:id", controller.update);
router.patch("/:id/status", validateUserStatus, controller.updateStatus);
router.delete("/:id", controller.remove);

module.exports = router;
