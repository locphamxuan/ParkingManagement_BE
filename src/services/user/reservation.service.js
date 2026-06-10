const mongoose = require('mongoose');
const Reservation = require('../../models/operations/Reservation');
const Building = require('../../models/building/Building');
const VehicleType = require('../../models/building/VehicleType');
const ParkingSlot = require('../../models/building/ParkingSlot');
const ReservationPolicy = require('../../models/policy/ReservationPolicy');
const User = require('../../models/user/User');
const WalletTransaction = require('../../models/finance/WalletTransaction');
const Payment = require('../../models/finance/Payment');
const AppError = require('../../utils/AppError');
const generateBookingCode = require('../../utils/generateBookingCode');
const buildingWalletService = require('../manager/buildingWallet.service');
const calculateReservationFee = require('../../utils/calculateReservationFee');

const CANCELLABLE_STATUSES = ['pending', 'confirmed'];

// Deposit is non-refundable — building keeps 100% of deposit on cancellation.
const REFUND_PERCENT = 0;

// Percentage of estimated fee charged as deposit at booking.
const DEPOSIT_RATE = 0.15;

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

  return { items: docs, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

const get = async (userId, id) => {
  const reservation = await Reservation.findOne({ _id: id, user: userId })
    .populate('building', 'name address')
    .populate('vehicleType', 'name')
    .populate({ path: 'slot', select: 'code floor', populate: { path: 'floor', select: 'name code' } })
    .lean();
  if (!reservation) throw new AppError('Reservation not found', 404);
  return reservation;
};

const create = async (userId, { buildingId, vehicleTypeId, vehicleType, plateNumber, startTime, endTime, slotId }) => {
  // ── 1. Require endTime ─────────────────────────────────────────────────────
  if (!endTime) {
    throw new AppError('endTime is required. Please select your checkout date and time.', 400);
  }

  // ── 2. Resolve building ────────────────────────────────────────────────────
  const building = await resolveBuilding(buildingId);
  if (!building) throw new AppError('Building not found', 404);
  const resolvedBuildingId = building._id;

  // ── 3. Resolve vehicleTypeId ───────────────────────────────────────────────
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

  // ── 4. Validate reservation policy ────────────────────────────────────────
  const policy = await ReservationPolicy.findOne({ building: resolvedBuildingId, isActive: true });
  if (!policy) throw new AppError('This building has no active reservation policy', 400);

  const start = new Date(startTime);
  const end = new Date(endTime);

  if (end <= start) {
    throw new AppError('endTime must be after startTime', 400);
  }

  const now = new Date();
  if (start < new Date(now.getTime() - 60 * 60 * 1000)) {
    throw new AppError('Start time is too far in the past, please select a valid time.', 400);
  }

  // ── Enforce 7-day maximum advance booking window ──────────────────────────
  const maxAllowedStart = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  if (start > maxAllowedStart) {
    throw new AppError('Chỉ được phép đặt trước chỗ đỗ theo giờ tối đa 7 ngày', 400);
  }

  // ── 5. Validate & assign slot ──────────────────────────────────────────────
  let resolvedSlotId = null;
  if (slotId) {
    const slot = await ParkingSlot.findOne({
      _id: slotId,
      building: resolvedBuildingId,
      status: 'available',
    });
    if (!slot) throw new AppError('Slot is no longer available or invalid', 409);
    resolvedSlotId = slot._id;

  }

  // ── 6. Calculate estimated fee and 15% deposit ────────────────────────────
  const { estimatedFee } = await calculateReservationFee(
    resolvedBuildingId, resolvedVehicleTypeId, start, end,
  );
  const depositAmount = Math.ceil(estimatedFee * DEPOSIT_RATE);

  // ── 7. Create reservation + charge deposit (atomic) ───────────────────────
  const code = generateBookingCode('RSV');

  const mongoSession = await mongoose.startSession();
  try {
    await mongoSession.withTransaction(async () => {
      // Debit the deposit from user wallet — requires sufficient balance.
      const updatedUser = await User.findOneAndUpdate(
        { _id: userId, walletBalance: { $gte: depositAmount } },
        { $inc: { walletBalance: -depositAmount } },
        { new: true, session: mongoSession },
      );
      if (!updatedUser) {
        throw new AppError(
          `Insufficient wallet balance. The deposit (15%) is ${depositAmount.toLocaleString('en-US')} VND — please top up your wallet.`,
          400,
        );
      }

      // Create the reservation confirmed (deposit paid).
      const [created] = await Reservation.create(
        [{
          code,
          user: userId,
          building: resolvedBuildingId,
          vehicleType: resolvedVehicleTypeId,
          plateNumber: String(plateNumber).trim().toUpperCase(),
          startTime: start,
          endTime: end,
          slot: resolvedSlotId,
          fee: depositAmount,
          estimatedFee,
          status: 'confirmed',
        }],
        { session: mongoSession },
      );

      // Wallet transaction (user-facing audit trail).
      await WalletTransaction.create(
        [{
          user: userId,
          type: 'debit',
          amount: depositAmount,
          balanceAfter: updatedUser.walletBalance,
          status: 'success',
          reason: 'reservation_deposit',
          metadata: { reservationId: `${created._id}`, code, estimatedFee, depositAmount },
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
          amount: depositAmount,
          status: 'success',
          user: userId,
        }],
        { session: mongoSession },
      );

      // Credit the deposit to the building wallet.
      await buildingWalletService.credit(
        resolvedBuildingId, depositAmount, 'reservation_fee', payment._id, mongoSession,
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

  return { reservation, depositAmount, estimatedFee };
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

      // Refund 85% of the deposit paid.
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

      // Deposit is non-refundable — building keeps the full deposit on cancellation.
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
            note: `Reservation ${reservation.code} cancelled — ${REFUND_PERCENT}% refund of deposit`,
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
