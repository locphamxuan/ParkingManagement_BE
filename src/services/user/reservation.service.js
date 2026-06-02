const mongoose = require('mongoose');
const Reservation = require('../../models/operations/Reservation');
const Building = require('../../models/building/Building');
const VehicleType = require('../../models/building/VehicleType');
const ParkingSlot = require('../../models/building/ParkingSlot');
const Gate = require('../../models/building/Gate');
const ReservationPolicy = require('../../models/policy/ReservationPolicy');
const User = require('../../models/user/User');
const WalletTransaction = require('../../models/finance/WalletTransaction');
const Payment = require('../../models/finance/Payment');
const AppError = require('../../utils/AppError');
const generateBookingCode = require('../../utils/generateBookingCode');
const buildingWalletService = require('../manager/buildingWallet.service');

const CANCELLABLE_STATUSES = ['pending', 'confirmed'];

// Reservation fee paid from the user's wallet when booking (not a deposit — it is
// the actual payment). Falls back to this value when the building's reservation
// policy has no bookingFee configured.
const DEFAULT_RESERVATION_FEE = 10000;

// Percentage of the paid amount refunded to the user's wallet on cancellation.
const REFUND_PERCENT = 85;

/**
 * Resolve the entry gate(s) a user should use for a set of reservations.
 * A gate serves a floor when its `floors` list is empty (serves all floors)
 * or explicitly contains that floor. We surface entry gates ('in'/'both').
 * Returns a Map<reservationId, gates[]>.
 */
async function resolveGatesFor(reservations) {
  const buildingIds = [
    ...new Set(reservations.map((r) => `${r.building?._id || r.building}`).filter(Boolean)),
  ];
  if (buildingIds.length === 0) return new Map();

  const gates = await Gate.find({
    building: { $in: buildingIds },
    status: 'active',
    direction: { $in: ['in', 'both'] },
  })
    .select('building code name direction floors')
    .lean();

  const map = new Map();
  for (const r of reservations) {
    const buildingId = `${r.building?._id || r.building}`;
    const slotFloorId = r.slot?.floor
      ? `${r.slot.floor._id || r.slot.floor}`
      : null;
    const matched = gates
      .filter((g) => `${g.building}` === buildingId)
      // A gate must be explicitly assigned to this floor — no "serves all floors" fallback.
      .filter((g) => slotFloorId && Array.isArray(g.floors) && g.floors.some((f) => `${f}` === slotFloorId))
      .map((g) => ({ _id: g._id, code: g.code, name: g.name, direction: g.direction }));
    map.set(`${r._id}`, matched);
  }
  return map;
}

/** Resolve building by ObjectId OR code string. */
async function resolveBuilding(buildingRef) {
  const query = mongoose.isValidObjectId(buildingRef)
    ? { _id: buildingRef }
    : { code: buildingRef.toString().toUpperCase() };
  return Building.findOne(query).select('_id');
}

const list = async (userId, query = {}) => {
  const filter = { user: userId };
  if (query.status) filter.status = query.status;

  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);

  const [docs, total] = await Promise.all([
    Reservation.find(filter)
      .sort('-startTime')
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('building', 'name address')
      .populate('vehicleType', 'name')
      .populate({ path: 'slot', select: 'code floor', populate: { path: 'floor', select: 'name code' } })
      .lean(),
    Reservation.countDocuments(filter),
  ]);

  const gateMap = await resolveGatesFor(docs);
  const items = docs.map((r) => ({ ...r, gates: gateMap.get(`${r._id}`) || [] }));

  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

const get = async (userId, id) => {
  const reservation = await Reservation.findOne({ _id: id, user: userId })
    .populate('building', 'name address')
    .populate('vehicleType', 'name')
    .populate({ path: 'slot', select: 'code floor', populate: { path: 'floor', select: 'name code' } })
    .lean();
  if (!reservation) throw new AppError('Reservation not found', 404);
  const gateMap = await resolveGatesFor([reservation]);
  reservation.gates = gateMap.get(`${reservation._id}`) || [];
  return reservation;
};

const create = async (userId, { buildingId, vehicleTypeId, vehicleType, plateNumber, startTime, endTime, slotId }) => {
  // ── 1. Resolve building ────────────────────────────────────────────────────
  const building = await resolveBuilding(buildingId);
  if (!building) throw new AppError('Building not found', 404);
  const resolvedBuildingId = building._id;

  // ── 2. Resolve vehicleTypeId ───────────────────────────────────────────────
  let resolvedVehicleTypeId = vehicleTypeId;
  if (!resolvedVehicleTypeId && vehicleType) {
    const vt = await VehicleType.findOne({
      building: resolvedBuildingId,
      isActive: true,
      $or: [
        { code: vehicleType.toString().toUpperCase() },
        { name: { $regex: new RegExp(`^${vehicleType}$`, 'i') } },
      ],
    });
    if (!vt) {
      const firstVt = await VehicleType.findOne({ building: resolvedBuildingId, isActive: true }).sort('code');
      if (!firstVt) throw new AppError('This building has no active vehicle types', 404);
      resolvedVehicleTypeId = firstVt._id;
    } else {
      resolvedVehicleTypeId = vt._id;
    }
  }

  const vehicleTypeExists = await VehicleType.exists({ _id: resolvedVehicleTypeId, building: resolvedBuildingId, isActive: true });
  if (!vehicleTypeExists) throw new AppError('Vehicle type not found for this building', 404);

  // ── 3. Validate reservation policy ────────────────────────────────────────
  const policy = await ReservationPolicy.findOne({ building: resolvedBuildingId, isActive: true });
  if (!policy) throw new AppError('This building has no active reservation policy', 400);

  const start = new Date(startTime);
  // Khách tự chọn thời gian bất kỳ — không giới hạn đặt trước tối thiểu/tối đa.
  // Chỉ kiểm tra startTime không nằm trong quá khứ quá 1 giờ (tránh lỗi nhập liệu).
  const now = new Date();
  if (start < new Date(now.getTime() - 60 * 60 * 1000)) {
    throw new AppError('Start time is too far in the past, please select a valid time.', 400);
  }

  // ── 4. Validate & assign slot ──────────────────────────────────────────────
  let resolvedSlotId = null;
  if (slotId) {
    const slot = await ParkingSlot.findOne({
      _id: slotId,
      building: resolvedBuildingId,
      status: 'available',
    });
    if (!slot) throw new AppError('Slot is no longer available or invalid', 409);
    resolvedSlotId = slot._id;

    // Block booking when the slot's floor has no entry gate assigned yet —
    // the user would otherwise have no gate to enter through.
    const hasEntryGate = await Gate.exists({
      building: resolvedBuildingId,
      status: 'active',
      direction: { $in: ['in', 'both'] },
      floors: slot.floor,
    });
    if (!hasEntryGate) {
      throw new AppError('This floor currently has no gate. Please choose another floor.', 409);
    }
  }

  // ── 5. Reservation fee (paid from the user wallet now) ────────────────────
  // This is the actual payment for the reservation (not a deposit). Falls back to
  // a default when the manager has not configured a bookingFee on the policy.
  const configuredFee = Number(policy.bookingFee);
  const actualFee = Number.isFinite(configuredFee) && configuredFee > 0
    ? configuredFee
    : DEFAULT_RESERVATION_FEE;

  // ── 6. Create reservation + charge wallet (atomic) ────────────────────────
  const code = generateBookingCode('RSV');

  const mongoSession = await mongoose.startSession();
  try {
    await mongoSession.withTransaction(async () => {
      // Debit the user wallet — requires sufficient balance.
      const updatedUser = await User.findOneAndUpdate(
        { _id: userId, walletBalance: { $gte: actualFee } },
        { $inc: { walletBalance: -actualFee } },
        { new: true, session: mongoSession },
      );
      if (!updatedUser) {
        throw new AppError(
          `Insufficient wallet balance. The reservation fee is ${actualFee.toLocaleString('en-US')} VND — please top up your wallet.`,
          400,
        );
      }

      // Create the reservation already confirmed (fee paid from wallet).
      const [created] = await Reservation.create(
        [{
          code,
          user: userId,
          building: resolvedBuildingId,
          vehicleType: resolvedVehicleTypeId,
          plateNumber: String(plateNumber).trim().toUpperCase(),
          startTime: start,
          endTime: endTime ? new Date(endTime) : undefined,
          slot: resolvedSlotId,
          fee: actualFee,
          status: 'confirmed',
        }],
        { session: mongoSession },
      );

      // Wallet transaction (user-facing audit trail).
      await WalletTransaction.create(
        [{
          user: userId,
          type: 'debit',
          amount: actualFee,
          balanceAfter: updatedUser.walletBalance,
          status: 'success',
          reason: 'reservation_fee',
          metadata: { reservationId: `${created._id}`, code },
        }],
        { session: mongoSession },
      );

      // Payment record (wallet method).
      const [payment] = await Payment.create(
        [{
          building: resolvedBuildingId,
          reservation: created._id,
          type: 'reservation',
          method: 'wallet',
          amount: actualFee,
          status: 'success',
          user: userId,
        }],
        { session: mongoSession },
      );

      // Credit the building wallet.
      await buildingWalletService.credit(
        resolvedBuildingId, actualFee, 'reservation_fee', payment._id, mongoSession,
      );

      // Reserve the slot.
      if (resolvedSlotId) {
        await ParkingSlot.findByIdAndUpdate(
          resolvedSlotId,
          { status: 'reserved' },
          { session: mongoSession },
        );
      }
    });
  } finally {
    mongoSession.endSession();
  }

  const reservation = await Reservation.findOne({ code })
    .populate('building', 'name address')
    .populate('vehicleType', 'name')
    .populate({ path: 'slot', select: 'code floor', populate: { path: 'floor', select: 'name code' } })
    .lean();

  const gateMap = await resolveGatesFor([reservation]);
  reservation.gates = gateMap.get(`${reservation._id}`) || [];

  return { reservation, fee: actualFee };
};

const cancel = async (userId, id) => {
  const mongoSession = await mongoose.startSession();
  let outcome;
  try {
    await mongoSession.withTransaction(async () => {
      const reservation = await Reservation.findOne({ _id: id, user: userId }).session(mongoSession);
      if (!reservation) throw new AppError('Reservation not found', 404);

      if (!CANCELLABLE_STATUSES.includes(reservation.status)) {
        throw new AppError('Cannot cancel a reservation in this status', 400);
      }

      // Actual amount the user paid (reality), fallback to the stored fee.
      const paidPayment = await Payment.findOne({
        reservation: reservation._id,
        type: 'reservation',
        status: 'success',
      }).session(mongoSession);
      const amountPaid = paidPayment?.amount ?? (Number(reservation.fee) || 0);
      const refund = Math.round((amountPaid * REFUND_PERCENT) / 100);

      // Release the reserved slot.
      if (reservation.slot) {
        await ParkingSlot.findByIdAndUpdate(reservation.slot, { status: 'available' }, { session: mongoSession });
      }

      reservation.status = 'cancelled';
      await reservation.save({ session: mongoSession });

      // Refund 85% of the paid amount to the user wallet; the building keeps 15%
      // as a cancellation fee (refund is drawn from the building wallet).
      if (refund > 0) {
        const updatedUser = await User.findByIdAndUpdate(
          userId,
          { $inc: { walletBalance: refund } },
          { new: true, session: mongoSession },
        );
        await WalletTransaction.create(
          [{
            user: userId,
            type: 'credit',
            amount: refund,
            balanceAfter: updatedUser.walletBalance,
            status: 'success',
            reason: 'reservation_refund',
            metadata: { reservationId: `${reservation._id}`, code: reservation.code, percent: REFUND_PERCENT },
          }],
          { session: mongoSession },
        );

        const [refundPayment] = await Payment.create(
          [{
            building: reservation.building,
            reservation: reservation._id,
            type: 'refund',
            method: 'wallet',
            amount: refund,
            status: 'success',
            user: userId,
            note: `Reservation ${reservation.code} cancelled — ${REFUND_PERCENT}% refund`,
          }],
          { session: mongoSession },
        );

        await buildingWalletService.debit(
          reservation.building, refund, 'refund', refundPayment._id, null, mongoSession,
        );
      }

      outcome = { reservation, refund, amountPaid };
    });
    return outcome;
  } finally {
    mongoSession.endSession();
  }
};

module.exports = { list, get, create, cancel };
