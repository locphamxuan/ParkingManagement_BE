const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/response');
const feedbackService = require('../../services/staff/feedback.service');

const mapCreateFeedbackPayload = (body = {}) => ({
  buildingId: body.buildingId,
  parkingSessionId: body.parkingSessionId,
  rating: body.rating,
  comment: body.comment,
  portraitImageUrl: body.portraitImageUrl,
  plateImageUrl: body.plateImageUrl,
});

const mapResolveFeedbackPayload = (body = {}) => ({
  staffReply: body.staffReply,
  status: body.status,
});

const createFeedback = asyncHandler(async (req, res) => {
  const feedback = await feedbackService.createFeedback(req.user, mapCreateFeedbackPayload(req.body));
  sendSuccess(res, {
    statusCode: 201,
    message: 'Feedback submitted',
    data: { feedback },
  });
});

const listMyFeedbacks = asyncHandler(async (req, res) => {
  const data = await feedbackService.listFeedbacks(req.user, req.query);
  sendSuccess(res, { data });
});

const listFeedbacks = asyncHandler(async (req, res) => {
  const data = await feedbackService.listFeedbacks(req.user, req.query);
  sendSuccess(res, { data });
});

const resolveFeedback = asyncHandler(async (req, res) => {
  const feedback = await feedbackService.resolveFeedback(
    req.user,
    req.params.id,
    mapResolveFeedbackPayload(req.body),
  );
  sendSuccess(res, {
    message: 'Feedback updated',
    data: { feedback },
  });
});

const listAllFeedbacks = asyncHandler(async (req, res) => {
  const data = await feedbackService.listAllFeedbacks(req.query);
  sendSuccess(res, { data });
});

module.exports = {
  createFeedback,
  listMyFeedbacks,
  listFeedbacks,
  resolveFeedback,
  listAllFeedbacks,
};

