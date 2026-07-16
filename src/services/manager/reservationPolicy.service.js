const ReservationPolicy = require("../../models/policy/ReservationPolicy");
const AppError = require("../../utils/AppError");
const { ensureManagerOwnsBuilding } = require("../../utils/managerScope");
const { writeAuditLog } = require("../../utils/audit");

// Chính sách hoàn tiền gói dài hạn — chỉ còn refundPercent sau khi bỏ reservation.
const validatePolicyPayload = (payload) => {
  if (payload.refundPercent !== undefined) {
    const v = Number(payload.refundPercent);
    if (Number.isNaN(v) || v < 0 || v > 100) {
      throw new AppError("refundPercent must be a number between 0 and 100", 400);
    }
  }
};

const DEFAULT_POLICY = {
  refundPercent: 80,
  isActive: true,
};

const get = async (user, buildingId) => {
  ensureManagerOwnsBuilding(user, buildingId);
  let policy = await ReservationPolicy.findOne({ building: buildingId });
  if (!policy) {
    policy = await ReservationPolicy.create({
      building: buildingId,
      ...DEFAULT_POLICY,
    });
  }
  return policy;
};

const upsert = async (user, buildingId, payload) => {
  ensureManagerOwnsBuilding(user, buildingId);
  validatePolicyPayload(payload);
  const current = await ReservationPolicy.findOne({ building: buildingId });

  const update = {};
  if (payload.refundPercent !== undefined) update.refundPercent = Number(payload.refundPercent);
  if (payload.isActive !== undefined) update.isActive = !!payload.isActive;

  const updated = await ReservationPolicy.findOneAndUpdate(
    { building: buildingId },
    { $set: update },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );

  await writeAuditLog({
    actor: user,
    action: "UPDATE_REFUND_POLICY",
    targetTable: "reservation_policies",
    targetId: updated._id,
    building: buildingId,
    previousValue: current ? current.toObject() : null,
    newValue: updated.toObject(),
    severity: "medium",
  });

  return updated;
};

module.exports = { get, upsert };
