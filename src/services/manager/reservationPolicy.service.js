const ReservationPolicy = require("../../models/policy/ReservationPolicy");
const { ensureManagerOwnsBuilding } = require("../../utils/managerScope");
const { writeAuditLog } = require("../../utils/audit");

const DEFAULT_POLICY = {
  reservableRatio: 0.3,
  maxHoldMinutes: 30,
  refundPercent: 80,
  minAdvanceMinutes: 15,
  maxAdvanceHours: 72,
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
  const current = await ReservationPolicy.findOne({ building: buildingId });

  const update = {};
  ["reservableRatio", "maxHoldMinutes", "refundPercent", "minAdvanceMinutes", "maxAdvanceHours"].forEach((k) => {
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

