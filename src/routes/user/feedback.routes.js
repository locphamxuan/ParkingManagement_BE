const express = require('express');
const feedbackController = require('../../controllers/user/feedback.controller');
const AppError = require('../../utils/AppError');
const { ROLES } = require('../../constants/roles');
const { authenticate } = require('../../middlewares/auth.middleware');

const router = express.Router();

const requireFeedbackUser = (req, _res, next) => {
  if (req.user?.role !== ROLES.USER) {
    return next(new AppError('Only registered users can submit feedback', 403, 'USER_FEEDBACK_ONLY'));
  }
  next();
};

router.post('/', authenticate, requireFeedbackUser, feedbackController.createFeedback);
router.get('/me', authenticate, requireFeedbackUser, feedbackController.listMyFeedbacks);
router.delete('/:id', authenticate, requireFeedbackUser, feedbackController.deleteFeedback);
router.get('/', feedbackController.listAllFeedbacks);

module.exports = router;
