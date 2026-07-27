const express = require('express');
const controller = require('../../controllers/user/notification.controller');

const router = express.Router();

router.get('/', controller.list);
router.patch('/read-all', controller.markAllRead);
router.patch('/:id/read', controller.markRead);

module.exports = router;
