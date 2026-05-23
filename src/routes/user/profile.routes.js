const express = require('express');
const controller = require('../../controllers/user/profile.controller');
const { validateUpdateProfile, validateChangePassword } = require('../../validators/user/profile.validator');

const router = express.Router();

router.put('/', validateUpdateProfile, controller.update);
router.put('/password', validateChangePassword, controller.changePassword);

module.exports = router;
