const Feedback = require("../../models/log/Feedback");
const AppError = require("../../utils/AppError");
const { ensureManagerOwnsBuilding } = require("../../utils/managerScope");
const { writeAuditLog } = require("../../utils/audit");

const list = async (user, buildingId, query = {}) => {
  ensureManagerOwnsBuilding(user, buildingId);
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const filter = { building: buildingId };
  if (query.status) filter.status = query.status;

  const [items, total] = await Promise.all([
    Feedback.find(filter)
      .populate("user", "fullName email phone")
      .populate("respondedBy", "fullName email")
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

const respond = async (user, buildingId, id, payload) => {
  ensureManagerOwnsBuilding(user, buildingId);
  const current = await Feedback.findOne({ _id: id, building: buildingId });
  if (!current) throw new AppError("Feedback not found", 404);

  const update = {};
  if (payload.response !== undefined) {
    update.response = String(payload.response).trim();
    update.respondedBy = user._id;
    update.respondedAt = new Date();
  }
  if (payload.status !== undefined) update.status = payload.status;
  else if (update.response && current.status === "open")
    update.status = "in_progress";

  const updated = await Feedback.findByIdAndUpdate(id, update, {
    new: true,
    runValidators: true,
  })
    .populate("user", "fullName email phone")
    .populate("respondedBy", "fullName email");

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
};

module.exports = { list, respond };

