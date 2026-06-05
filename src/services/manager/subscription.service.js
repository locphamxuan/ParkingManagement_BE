const ManagerSubscription = require('../../models/finance/ManagerSubscription');

/**
 * Return the building's subscription record if it is currently active
 * (endDate strictly in the future), otherwise null.
 */
const getActiveSubscription = async (buildingId) => {
  const sub = await ManagerSubscription.findOne({ building: buildingId });
  if (!sub) return null;
  return sub.endDate > new Date() ? sub : null;
};

const hasActiveSubscription = async (buildingId) => {
  return !!(await getActiveSubscription(buildingId));
};

/**
 * Subscription status payload for the frontend gate.
 */
const getStatus = async (buildingId) => {
  const sub = await ManagerSubscription.findOne({ building: buildingId })
    .populate('package', 'name price durationDays');
  const now = new Date();
  const active = !!sub && sub.endDate > now;
  return {
    active,
    endDate: sub?.endDate ?? null,
    startDate: sub?.startDate ?? null,
    daysRemaining: active
      ? Math.ceil((sub.endDate.getTime() - now.getTime()) / 86_400_000)
      : 0,
    package: sub?.package ?? null,
    packageName: sub?.packageName ?? null,
  };
};

/**
 * Record (create or extend) a building's subscription after a successful purchase.
 * If the building already has time remaining, the new duration stacks on top of
 * the existing endDate; otherwise it starts from now.
 *
 * @param {string|ObjectId} buildingId
 * @param {string|ObjectId} managerId
 * @param {{ _id, name, price, durationDays }} pkg
 */
const recordSubscription = async (buildingId, managerId, pkg, amountPaid = pkg.price) => {
  const now = new Date();
  const durationDays = Number(pkg.durationDays) || 30;

  const existing = await ManagerSubscription.findOne({ building: buildingId });
  const base = existing && existing.endDate > now ? new Date(existing.endDate) : now;
  const endDate = new Date(base.getTime() + durationDays * 86_400_000);

  return ManagerSubscription.findOneAndUpdate(
    { building: buildingId },
    {
      building: buildingId,
      manager: managerId,
      package: pkg._id,
      packageName: pkg.name,
      startDate: existing?.startDate && existing.endDate > now ? existing.startDate : now,
      endDate,
      lastAmountPaid: amountPaid,
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
};

/**
 * Immediately expire a building's subscription (admin override).
 * Sets endDate to now so the dashboard locks. No-op if there is no record.
 */
const expireSubscription = async (buildingId) => {
  return ManagerSubscription.findOneAndUpdate(
    { building: buildingId },
    { endDate: new Date() },
    { new: true },
  );
};

module.exports = {
  getActiveSubscription,
  hasActiveSubscription,
  getStatus,
  recordSubscription,
  expireSubscription,
};
