const mongoose = require('mongoose');
const Feedback = require('../../models/operations/Feedback');
const AppError = require('../../utils/AppError');
const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/response');

const optionalImageUrl = (value, field) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new AppError(`${field} must be a URL`, 400);

  const url = value.trim();
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Unsupported protocol');
  } catch {
    throw new AppError(`${field} must be a valid HTTP(S) URL`, 400);
  }
  return url;
};

const createFeedback = asyncHandler(async (req, res) => {
  const { parkingSession, rating, comment, building, portraitImageUrl, plateImageUrl } = req.body;
  if (!parkingSession) throw new AppError('parkingSession is required', 400);
  if (!rating) throw new AppError('rating is required', 400);
  if (!comment) throw new AppError('comment is required', 400);

  const existing = await Feedback.findOne({ parkingSession, user: req.user._id });
  if (existing) throw new AppError('You have already submitted feedback for this session', 409);

  const feedback = await Feedback.create({
    user: req.user._id,
    parkingSession,
    rating: Number(rating),
    comment: String(comment).trim(),
    building: building || null,
    portraitImageUrl: optionalImageUrl(portraitImageUrl, 'portraitImageUrl'),
    plateImageUrl: optionalImageUrl(plateImageUrl, 'plateImageUrl'),
  });

  sendSuccess(res, { message: 'Feedback submitted', data: { feedback } }, 201);
});

const listMyFeedbacks = asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);

  const filter = { user: req.user._id };

  const [items, total] = await Promise.all([
    Feedback.find(filter)
      .populate('building', 'name code')
      .populate('parkingSession', 'plateNumber entryTime exitTime fee')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(limit),
    Feedback.countDocuments(filter),
  ]);

  sendSuccess(res, {
    data: { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } },
  });
});

const deleteFeedback = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    throw new AppError('Invalid feedback id', 400);
  }
  const feedback = await Feedback.findOne({ _id: req.params.id, user: req.user._id });
  if (!feedback) throw new AppError('Feedback not found', 404);
  if (feedback.status === 'resolved') throw new AppError('Cannot delete a resolved feedback', 400);

  await feedback.deleteOne();
  sendSuccess(res, { message: 'Feedback deleted' });
});

const listAllFeedbacks = asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const filter = {};
  if (req.query.building) filter.building = req.query.building;
  if (req.query.rating) filter.rating = Number(req.query.rating);

  const [items, total] = await Promise.all([
    Feedback.find(filter)
      .populate('user', 'fullName')
      .populate('building', 'name code')
      .populate('parkingSession', 'plateNumber entryTime')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(limit),
    Feedback.countDocuments(filter),
  ]);

  sendSuccess(res, {
    data: { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } },
  });
});

module.exports = { createFeedback, listMyFeedbacks, deleteFeedback, listAllFeedbacks };
