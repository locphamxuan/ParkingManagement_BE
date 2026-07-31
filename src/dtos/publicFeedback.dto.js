/**
 * Public reviews DTO — GET /api/users/feedbacks is unauthenticated, so this is
 * an explicit allowlist rather than anything derived from the document.
 *
 * Never add: user (or any populated user field), parkingSession, plateNumber,
 * portraitImageUrl, plateImageUrl, repliedBy, or any other direct image URL.
 * Callers that need those must go through the authenticated, building-scoped
 * manager endpoints (GET /api/manager/buildings/:buildingId/feedbacks).
 */

// Mongoose projection for the query itself — sensitive fields never leave Mongo.
const PUBLIC_FEEDBACK_PROJECTION = 'rating comment building staffReply repliedAt status createdAt updatedAt';

// Only resolved feedback is published; `pending` is unmoderated user text.
const PUBLIC_FEEDBACK_STATUS = 'resolved';

const toPublicBuilding = (building) => {
  if (!building || typeof building !== 'object' || !building._id) return null;
  return {
    id: String(building._id),
    name: building.name || null,
    code: building.code || null,
  };
};

const toPublicFeedback = (doc) => ({
  id: String(doc._id),
  rating: doc.rating,
  comment: doc.comment,
  building: toPublicBuilding(doc.building),
  staffReply: doc.staffReply || null,
  repliedAt: doc.repliedAt || null,
  status: doc.status,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

module.exports = {
  toPublicFeedback,
  PUBLIC_FEEDBACK_PROJECTION,
  PUBLIC_FEEDBACK_STATUS,
};
