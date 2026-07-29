const mongoose = require('mongoose');
const Feedback = require('../../models/operations/Feedback');
const ParkingSession = require('../../models/operations/ParkingSession');
const AppError = require('../../utils/AppError');
const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/response');
const {
  toPublicFeedback,
  PUBLIC_FEEDBACK_PROJECTION,
  PUBLIC_FEEDBACK_STATUS,
} = require('../../dtos/publicFeedback.dto');

const isFeedbackConflict = (error) => {
  if (error?.code !== 11000) return false;
  if (`${error?.message || ''}`.includes('uniq_feedback_per_user_session')) return true;

  const keys = Object.keys(error?.keyPattern || {}).sort();
  return keys.length === 2 && keys[0] === 'parkingSession' && keys[1] === 'user';
};

/**
 * Đánh giá chỉ được viết cho phiên gửi xe CỦA CHÍNH người dùng và đã HOÀN TẤT.
 * `building` client gửi lên bị bỏ qua hoàn toàn — building luôn suy từ phiên đã
 * xác thực ở server, nếu không client có thể gắn review vào tòa nhà bất kỳ.
 */
const createFeedback = asyncHandler(async (req, res) => {
  const { parkingSession, rating, comment } = req.body;
  if (!parkingSession) throw new AppError('parkingSession is required', 400);
  if (!mongoose.Types.ObjectId.isValid(parkingSession)) {
    throw new AppError('Invalid parkingSession id', 400, 'INVALID_PARKING_SESSION');
  }
  if (!rating) throw new AppError('rating is required', 400);
  if (!comment) throw new AppError('comment is required', 400);

  const session = await ParkingSession.findOne({
    _id: parkingSession,
    user: req.user._id,
  }).select('_id building status');
  if (!session) {
    throw new AppError(
      'Parking session not found for this account',
      404,
      'PARKING_SESSION_NOT_FOUND',
    );
  }
  if (session.status !== 'completed') {
    throw new AppError(
      'You can only review a completed parking session',
      409,
      'PARKING_SESSION_NOT_COMPLETED',
    );
  }

  try {
    const feedback = await Feedback.create({
      user: req.user._id,
      parkingSession: session._id,
      rating: Number(rating),
      comment: String(comment).trim(),
      building: session.building || null,
    });
    sendSuccess(res, { message: 'Feedback submitted', data: { feedback } }, 201);
  } catch (error) {
    // Unique index {user, parkingSession}: hai request song song cùng qua được bước
    // kiểm tra "đã đánh giá chưa" → DB chặn cái thứ hai.
    if (isFeedbackConflict(error)) {
      throw new AppError(
        'You have already submitted feedback for this session',
        409,
        'FEEDBACK_ALREADY_EXISTS',
      );
    }
    throw error;
  }
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

/**
 * Public reviews feed — no authentication. Everything it returns goes through
 * publicFeedback.dto; see that file for what must never be exposed here.
 */
const listAllFeedbacks = asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);

  const filter = { status: PUBLIC_FEEDBACK_STATUS };
  const building = req.query.building || req.query.buildingId;
  if (building) {
    if (!mongoose.Types.ObjectId.isValid(building)) {
      throw new AppError('Invalid building id', 400);
    }
    filter.building = building;
  }
  if (req.query.rating) filter.rating = Number(req.query.rating);

  const [docs, total] = await Promise.all([
    Feedback.find(filter)
      .select(PUBLIC_FEEDBACK_PROJECTION)
      .populate('building', 'name code')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Feedback.countDocuments(filter),
  ]);

  sendSuccess(res, {
    data: {
      items: docs.map(toPublicFeedback),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    },
  });
});

module.exports = { createFeedback, listMyFeedbacks, deleteFeedback, listAllFeedbacks };
