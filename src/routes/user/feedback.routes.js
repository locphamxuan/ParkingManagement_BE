const express = require('express');
const feedbackController = require('../../controllers/staff/feedback.controller');
const AppError = require('../../utils/AppError');
const { ROLES } = require('../../constants/roles');

const router = express.Router();

const requireFeedbackUser = (req, _res, next) => {
  if (req.user?.role !== ROLES.USER) {
    return next(new AppError('Only registered users can submit feedback', 403, 'USER_FEEDBACK_ONLY'));
  }
  next();
};

router.post('/', requireFeedbackUser, feedbackController.createFeedback);
router.get('/me', requireFeedbackUser, feedbackController.listMyFeedbacks);
router.get('/', feedbackController.listAllFeedbacks);

module.exports = router;
