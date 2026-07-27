const mongoose = require("mongoose");
const Feedback = require("../../models/operations/Feedback");
const Notification = require("../../models/log/Notification");
const AppError = require("../../utils/AppError");
const { ensureManagerOwnsBuilding } = require("../../utils/managerScope");
const { writeAuditLog } = require("../../utils/audit");

const { FEEDBACK_STATUS } = Feedback;

const list = async (user, buildingId, query = {}) => {
  ensureManagerOwnsBuilding(user, buildingId);

  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const filter = { building: buildingId };

  if (query.status) {
    if (!FEEDBACK_STATUS.includes(query.status)) {
      throw new AppError(`status must be one of: ${FEEDBACK_STATUS.join(", ")}`, 400);
    }
    filter.status = query.status;
  }

  const [items, total] = await Promise.all([
    Feedback.find(filter)
      .populate("user", "fullName email phone")
      .populate("building", "name code address")
      .populate("parkingSession", "plateNumber entryTime exitTime fee status")
      .populate("repliedBy", "fullName email role")
      .sort("-createdAt")
      .skip((page - 1) * limit)
      .limit(limit),
    Feedback.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

const respond = async (user, buildingId, id, payload = {}) => {
  ensureManagerOwnsBuilding(user, buildingId);

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid feedback id", 400);
  }

  const mongoSession = await mongoose.startSession();
  try {
    let current;
    let updated;

    await mongoSession.withTransaction(async () => {
      current = await Feedback.findOne({ _id: id, building: buildingId }).session(mongoSession);
      if (!current) throw new AppError("Feedback not found", 404);

      const update = {};
      if (payload.staffReply !== undefined || payload.response !== undefined) {
        update.staffReply = String(payload.staffReply ?? payload.response ?? "").trim() || null;
      }

      if (payload.status !== undefined) {
        if (!FEEDBACK_STATUS.includes(payload.status)) {
          throw new AppError(`status must be one of: ${FEEDBACK_STATUS.join(", ")}`, 400);
        }
        update.status = payload.status;
      } else if (update.staffReply) {
        update.status = "resolved";
      }
      
      if (update.staffReply) {
        update.repliedBy = user._id;
        update.repliedAt = new Date();
      }

      updated = await Feedback.findByIdAndUpdate(id, update, {
        new: true,
        runValidators: true,
        session: mongoSession,
      })
        .populate("user", "fullName email phone")
        .populate("building", "name code address")
        .populate("parkingSession", "plateNumber entryTime exitTime fee status")
        .populate("repliedBy", "fullName email role");

      if (update.staffReply) {
        await Notification.create(
          [
            {
              user: current.user,
              type: "feedback_reply",
              title: "Manager replied to your feedback",
              message: `Manager response: ${update.staffReply}`,
              feedback: current._id,
              building: current.building,
              isRead: false,
            },
          ],
          { session: mongoSession }
        );
      }
    });

    await writeAuditLog({
      actor: user,
      action: "RESPOND_FEEDBACK",
      targetTable: "feedbacks",
      targetId: id,
      building: buildingId,
      previousValue: current.toObject(),
      newValue: updated.toObject(),
    });

    return updated;
  } finally {
    mongoSession.endSession();
  }
};

module.exports = { list, respond };