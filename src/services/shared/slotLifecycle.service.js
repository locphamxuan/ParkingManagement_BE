const mongoose = require('mongoose');
const AppError = require('../../utils/AppError');
const {
  LongTermSubscription,
  ParkingSession,
  ParkingSlot,
} = require('../../models');

const subscriptionIdFromSession = (parkingSession) => {
  const match = /long_term:([a-f\d]{24})/i.exec(parkingSession?.note || '');
  return match?.[1] || null;
};

const releaseFixedSlot = async (slotId, mongoSession) => {
  if (!slotId) return;
  await ParkingSlot.updateOne(
    { _id: slotId, status: 'reserved' },
    { $set: { status: 'available' } },
    { session: mongoSession },
  );
};

const expireSubscriptionInSession = async (subscriptionId, now, mongoSession) => {
  const expired = await LongTermSubscription.findOneAndUpdate(
    { _id: subscriptionId, status: 'active', endDate: { $lt: now } },
    { $set: { status: 'expired' } },
    { new: true, session: mongoSession },
  );
  if (!expired) return null;
  await releaseFixedSlot(expired.slot, mongoSession);
  return expired;
};

const expireSubscription = async (subscriptionId, now = new Date()) => {
  const mongoSession = await mongoose.startSession();
  try {
    let expired = null;
    await mongoSession.withTransaction(async () => {
      expired = await expireSubscriptionInSession(subscriptionId, now, mongoSession);
    });
    return expired;
  } finally {
    await mongoSession.endSession();
  }
};

const expireStaleSubscriptions = async (
  { plateNumber, buildingIds, now = new Date() },
  mongoSession,
) => {
  const query = LongTermSubscription.find({
    plateNumber,
    building: { $in: buildingIds },
    status: 'active',
    endDate: { $lt: now },
  }).select('_id');
  if (mongoSession) query.session(mongoSession);
  const stale = await query;
  for (const subscription of stale) {
    await expireSubscriptionInSession(subscription._id, now, mongoSession);
  }
  return stale.length;
};

const claimFixedSlotForRenewal = async (subscription, mongoSession) => {
  if (!subscription.slot) return null;

  const slotId = subscription.slot._id || subscription.slot;
  const otherOwner = await LongTermSubscription.exists({
    _id: { $ne: subscription._id },
    slot: slotId,
    status: 'active',
  }).session(mongoSession);
  if (otherOwner) {
    throw new AppError(
      'The previous fixed slot belongs to another active subscription',
      409,
      'FIXED_SLOT_UNAVAILABLE',
      { requiresSlotSelection: true },
    );
  }

  const slot = await ParkingSlot.findOne({
    _id: slotId,
    building: subscription.building,
  }).session(mongoSession);
  if (!slot || slot.status === 'maintenance') {
    throw new AppError(
      'The previous fixed slot is unavailable',
      409,
      'FIXED_SLOT_UNAVAILABLE',
      { requiresSlotSelection: true },
    );
  }

  if (slot.status === 'available') {
    const claimed = await ParkingSlot.findOneAndUpdate(
      { _id: slotId, status: 'available' },
      { $set: { status: 'reserved' } },
      { new: true, session: mongoSession },
    );
    if (claimed) return claimed;
  }

  if (slot.status === 'reserved') return slot;

  if (slot.status === 'occupied') {
    const ownSession = await ParkingSession.exists({
      building: subscription.building,
      slot: slotId,
      plateNumber: subscription.plateNumber,
      status: 'active',
      paymentMethod: 'long_term',
    }).session(mongoSession);
    if (ownSession) return slot;
  }

  throw new AppError(
    'The previous fixed slot is unavailable',
    409,
    'FIXED_SLOT_UNAVAILABLE',
    { requiresSlotSelection: true },
  );
};

const occupyFixedSlotForCheckIn = async (subscription, buildingId, mongoSession) => {
  const slotId = subscription.slot?._id || subscription.slot;
  if (!slotId) return null;

  const otherOwner = await LongTermSubscription.exists({
    _id: { $ne: subscription._id },
    slot: slotId,
    status: 'active',
  }).session(mongoSession);
  if (otherOwner) {
    throw new AppError('Fixed slot belongs to another subscription', 409, 'FIXED_SLOT_UNAVAILABLE');
  }

  const occupied = await ParkingSlot.findOneAndUpdate(
    {
      _id: slotId,
      building: buildingId,
      status: 'reserved',
    },
    { $set: { status: 'occupied' } },
    { new: true, session: mongoSession },
  );
  if (occupied) return occupied;

  const slot = await ParkingSlot.findById(slotId).session(mongoSession);
  if (!slot || String(slot.building) !== String(buildingId)) {
    throw new AppError('Invalid fixed slot', 409, 'FIXED_SLOT_UNAVAILABLE');
  }
  if (slot.status === 'maintenance') {
    throw new AppError('Assigned slot is under maintenance', 409, 'SLOT_MAINTENANCE_NOT_AVAILABLE');
  }
  if (slot.status === 'occupied') {
    throw new AppError('Your fixed slot is currently occupied', 409, 'FIXED_SLOT_OCCUPIED');
  }
  throw new AppError('Fixed slot is not reserved for this subscription', 409, 'FIXED_SLOT_UNAVAILABLE');
};

const finalizeSlotAfterCheckout = async (parkingSession, mongoSession, now = new Date()) => {
  const slotId = parkingSession.slot?._id || parkingSession.slot;
  if (!slotId) return null;

  const subscriptionId = subscriptionIdFromSession(parkingSession);
  const activeFixedSubscription = subscriptionId
    ? await LongTermSubscription.exists({
        _id: subscriptionId,
        slot: slotId,
        building: parkingSession.building,
        status: 'active',
        startDate: { $lte: now },
        endDate: { $gte: now },
      }).session(mongoSession)
    : null;

  return ParkingSlot.findOneAndUpdate(
    { _id: slotId, status: { $ne: 'maintenance' } },
    { $set: { status: activeFixedSubscription ? 'reserved' : 'available' } },
    { new: true, session: mongoSession },
  );
};

module.exports = {
  subscriptionIdFromSession,
  releaseFixedSlot,
  expireSubscription,
  expireSubscriptionInSession,
  expireStaleSubscriptions,
  claimFixedSlotForRenewal,
  occupyFixedSlotForCheckIn,
  finalizeSlotAfterCheckout,
};
