const ReservationPolicy = require("../../models/policy/ReservationPolicy");
const AppError = require("../../utils/AppError");
const { ensureManagerOwnsBuilding } = require("../../utils/managerScope");
const { writeAuditLog } = require("../../utils/audit");

// Các trường % phải nằm trong [0,100]; các trường thời lượng phải >= 0.
const PERCENT_FIELDS = ["overstayPenaltyPercent", "refundPercent", "depositPercent"];
const NON_NEGATIVE_FIELDS = ["maxHoldMinutes", "maxAdvanceDays", "maxDurationHours"];

const validatePolicyPayload = (payload) => {
  for (const k of PERCENT_FIELDS) {
    if (payload[k] === undefined) continue;
    const v = Number(payload[k]);
    if (Number.isNaN(v) || v < 0 || v > 100) {
      throw new AppError(`${k} must be a number between 0 and 100`, 400);
    }
  }
  for (const k of NON_NEGATIVE_FIELDS) {
    if (payload[k] === undefined) continue;
    const v = Number(payload[k]);
    if (Number.isNaN(v) || v < 0) {
      throw new AppError(`${k} must be a non-negative number`, 400);
    }
  }
  if (payload.cancellationCutoffHours !== undefined) {
    const v = Number(payload.cancellationCutoffHours);
    if (Number.isNaN(v) || v < 0) {
      throw new AppError("cancellationCutoffHours must be a non-negative number", 400);
    }
  }
};

const DEFAULT_POLICY = {
  maxHoldMinutes: 30,
  maxAdvanceDays: 7,
  maxDurationHours: 24,
  overstayPenaltyPercent: 0,
  refundPercent: 80,
  depositPercent: 15,
  cancellationCutoffHours: 0,
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
  ["maxHoldMinutes", "maxAdvanceDays", "maxDurationHours", "overstayPenaltyPercent", "refundPercent", "depositPercent", "cancellationCutoffHours"].forEach((k) => {
    if (payload[k] !== undefined) update[k] = Number(payload[k]);
  });
  if (payload.isActive !== undefined) update.isActive = !!payload.isActive;

  const updated = await ReservationPolicy.findOneAndUpdate(
    { building: buildingId },
    { $set: update },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );

  await writeAuditLog({
    actor: user,
    action: "UPDATE_RESERVATION_POLICY",
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

