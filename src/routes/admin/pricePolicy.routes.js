const express = require("express");
const controller = require("../../controllers/admin/pricePolicy.controller");

const router = express.Router();

// Admin chỉ xem, không push/sửa giá — manager tự quản lý
router.get("/", controller.list);

module.exports = router;
