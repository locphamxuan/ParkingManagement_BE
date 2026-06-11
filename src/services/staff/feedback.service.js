const mongoose = require('mongoose');
const Feedback = require('../../models/operations/Feedback');
const ParkingSession = require('../../models/operations/ParkingSession');
const AppError = require('../../utils/AppError');
const { ROLES } = require('../../constants/roles');
const { assignedBuildingIds, assertBuildingScope } = require('../../utils/staffScope');

const FEEDBACK_STATUS = ['pending', 'resolved'];

const parsePagination = (filters = {}) => {
  const page = Math.max(Number(filters.page) || 1, 1);
  const limit = Math.min(Math.max(Number(filters.limit) || 20, 1), 100);
  return { page, limit };
};

const normalizeRating = (rating) => {
  if (
    typeof rating !== 'number' ||
    !Number.isInteger(rating) ||
    rating < 1 ||
    rating > 5
  ) {
    throw new AppError(
      'Invalid feedback rating',
      400,
      'INVALID_FEEDBACK_RATING',
    );
  }
  return rating;
};

const normalizeComment = (comment) => {
  const value = `${comment || ''}`.trim();
  if (!value) {
    throw new AppError(
      'Validation Failed: Comment content cannot be empty. Please specify your issue.',
      400,
      'FEEDBACK_COMMENT_REQUIRED',
    );
  }
  if (value.length > 1000) {
    throw new AppError('comment cannot exceed 1000 characters', 400, 'FEEDBACK_COMMENT_TOO_LONG');
  }
  return value;
};

const normalizeObjectId = (value, fieldName, errorCode) => {
  if (!value) {
    throw new AppError(`${fieldName} is required`, 400, errorCode);
  }
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new AppError(`Invalid ${fieldName}`, 400, errorCode);
  }
  return value;
};

const normalizeOptionalString = (value, fieldName, maxLength = 2048) => {
  if (value === undefined || value === null) return null;
  const normalized = `${value}`.trim();
  if (!normalized) return null;
  if (normalized.length > maxLength) {
    throw new AppError(`${fieldName} cannot exceed ${maxLength} characters`, 400, 'FEEDBACK_MEDIA_URL_TOO_LONG');
  }
  return normalized;
};

const normalizeStaffBuildingId = (buildingId) => {
  if (!buildingId) {
    throw new AppError('buildingId is required', 400, 'BUILDING_ID_REQUIRED');
  }
  if (!mongoose.Types.ObjectId.isValid(buildingId)) {
    throw new AppError('Invalid buildingId', 400, 'INVALID_BUILDING_ID');
  }
  return buildingId;
};

const createFeedback = async (userContext, payload = {}) => {
  if (!userContext || userContext.role !== ROLES.USER) {
    throw new AppError('Only registered users can submit feedback', 403, 'USER_FEEDBACK_ONLY');
  }

  const parkingSessionId = normalizeObjectId(
    payload.parkingSessionId,
    'parkingSessionId',
    'INVALID_PARKING_SESSION_ID',
  );
  const rating = normalizeRating(payload.rating);
  const comment = normalizeComment(payload.comment);
  const portraitImageUrl = normalizeOptionalString(payload.portraitImageUrl, 'portraitImageUrl');
  const plateImageUrl = normalizeOptionalString(payload.plateImageUrl, 'plateImageUrl');

  const mongoSession = await mongoose.startSession();
  try {
    let created;
    await mongoSession.withTransaction(async () => {
      const parkingSession = await ParkingSession.findOne({
        _id: parkingSessionId,
        user: userContext._id,
        status: 'completed',
      })
        .select('_id building')
        .session(mongoSession);

      if (!parkingSession) {
        throw new AppError(
          'Feedback denied. You can only review after completing a successful parking session.',
          403,
          'FEEDBACK_COMPLETED_SESSION_REQUIRED',
        );
      }

      const [doc] = await Feedback.create(
        [{
          user: userContext._id,
          building: parkingSession.building,
          parkingSession: parkingSession._id,
          rating,
          comment,
          portraitImageUrl,
          plateImageUrl,
          status: 'pending',
        }],
        { session: mongoSession },
      );
      created = doc;
    });

    return Feedback.findById(created._id)
      .populate('user', 'fullName email')
      .populate('building', 'name code address')
      .populate('parkingSession', 'plateNumber entryTime exitTime fee status')
      .populate('repliedBy', 'fullName email role');
  } finally {
    mongoSession.endSession();
  }
};

const listFeedbacks = async (userContext, filters = {}) => {
  const { page, limit } = parsePagination(filters);
  const filter = {};

  if (userContext?.role === ROLES.USER) {
    filter.user = userContext._id;
  } else if (userContext?.role === ROLES.STAFF) {
    throw new AppError(
      'Staff are not allowed to access feedback',
      403,
      'STAFF_FEEDBACK_ACCESS_DENIED',
    );
  } else if (userContext?.role === ROLES.MANAGER) {
    const buildingId = normalizeStaffBuildingId(filters.buildingId || filters.building);
    assertBuildingScope(userContext, buildingId);
    filter.building = buildingId;
  } else {
    throw new AppError('Forbidden', 403);
  }

  if (filters.status) {
    if (!FEEDBACK_STATUS.includes(filters.status)) {
      throw new AppError('Invalid feedback status', 400, 'INVALID_FEEDBACK_STATUS');
    }
    filter.status = filters.status;
  }
  if (filters.rating) {
    filter.rating = normalizeRating(filters.rating);
  }

  const mongoSession = await mongoose.startSession();
  try {
    let items = [];
    let total = 0;

    await mongoSession.withTransaction(async () => {
      items = await Feedback.find(filter)
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('user', 'fullName email phone')
        .populate('building', 'name code address')
        .populate('parkingSession', 'plateNumber entryTime exitTime fee status')
        .populate('repliedBy', 'fullName email role')
        .session(mongoSession);

      total = await Feedback.countDocuments(filter).session(mongoSession);
    });

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  } finally {
    mongoSession.endSession();
  }
};

const resolveFeedback = async (staffContext, feedbackId, replyPayload = {}) => {
  if (staffContext?.role !== ROLES.MANAGER) {
    throw new AppError(
      'Only managers can resolve feedback',
      403,
      'MANAGER_FEEDBACK_RESOLVE_ONLY',
    );
  }
  if (!mongoose.Types.ObjectId.isValid(feedbackId)) {
    throw new AppError('Invalid feedbackId', 400, 'INVALID_FEEDBACK_ID');
  }

  const mongoSession = await mongoose.startSession();
  try {
    let updated;
    await mongoSession.withTransaction(async () => {
      const feedback = await Feedback.findById(feedbackId).session(mongoSession);
      if (!feedback) {
        throw new AppError('Feedback not found', 404, 'FEEDBACK_NOT_FOUND');
      }

      if (feedback.building) {
        assertBuildingScope(staffContext, feedback.building);
      } else if (!assignedBuildingIds(staffContext).length) {
        throw new AppError('No assigned buildings for this account', 403, 'FORBIDDEN_BUILDING_SCOPE');
      }

      if (replyPayload.staffReply !== undefined) {
        const reply = `${replyPayload.staffReply || ''}`.trim();
        if (reply.length > 1000) {
          throw new AppError('staffReply cannot exceed 1000 characters', 400, 'FEEDBACK_REPLY_TOO_LONG');
        }
        feedback.staffReply = reply || null;
      }

      if (replyPayload.status && replyPayload.status !== 'resolved') {
        throw new AppError('Invalid feedback status', 400, 'INVALID_FEEDBACK_STATUS');
      }
      feedback.status = 'resolved';
      feedback.repliedBy = staffContext._id;

      updated = await feedback.save({ session: mongoSession });
    });

    return Feedback.findById(updated._id)
      .populate('user', 'fullName email phone')
      .populate('building', 'name code address')
      .populate('parkingSession', 'plateNumber entryTime exitTime fee status')
      .populate('repliedBy', 'fullName email role');
  } finally {
    mongoSession.endSession();
  }
};

module.exports = {
  createFeedback,
  listFeedbacks,
  resolveFeedback,
};
