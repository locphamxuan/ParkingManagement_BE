const express = require('express');
const feedbackController = require('../../controllers/staff/feedback.controller');

const router = express.Router();

router.get('/', feedbackController.listFeedbacks);
router.patch('/:id/resolve', feedbackController.resolveFeedback);

module.exports = router;
