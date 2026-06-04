const mongoose = require('mongoose');
const AppError = require('../../utils/AppError');
const buildingRepository = require('../../repositories/building.repository');
const {
  ParkingSession,
  ParkingSlot,
  Reservation,
  LongTermSubscription,
  Payment,
  WalletTransaction,
  User,
} = require('../../models');
const { assignedBuildingIds, assertBuildingScope, logAudit } = require('../../utils/staffScope');
const payosService = require('../payment/payos.service');
const buildingWalletService = require('../manager/buildingWallet.service');

const normalizePlate = (plate) => `${plate || ''}`.trim().toUpperCase();

const asObjectId = (value) =>
  mongoose.Types.ObjectId.isValid(value) ? value : null;

const findDuplicateActiveSession = async (plateNumber) =>
  ParkingSession.findOne({ plateNumber, status: 'active' });

const resolveLongTermSubscription = async (plateNumber, allowedBuildings) => {
  const subscription = await LongTermSubscription.findOne({
    plateNumber,
    status: 'active',
    building: { $in: allowedBuildings },
  }).sort({ updatedAt: -1 });

  if (!subscription) {
    return null;
  }

  const endAt = subscription.endDate ? new Date(subscription.endDate) : null;
  if (endAt && endAt.getTime() < Date.now()) {
    await LongTermSubscription.updateOne(
      { _id: subscription._id },
      { $set: { status: 'expired' } },
    );
    return null;
  }

  return subscription;
};

const resolveReservation = async (plateNumber, allowedBuildings) => {
  const reservation = await Reservation.findOne({
    plateNumber,
    building: { $in: allowedBuildings },
    status: { $in: ['pending', 'confirmed'] },
  })
    .sort({ updatedAt: -1 })
    .populate('slot');

  if (!reservation) {
    return null;
  }

  const now = Date.now();
  const expiresAt = reservation.endTime ? new Date(reservation.endTime) : null;
  const expired =
    expiresAt && expiresAt.getTime() < now;

  if (expired) {
    reservation.status = 'expired';
    await reservation.save();
    return null;
  }

  if (reservation.slot && reservation.slot.status === 'maintenance') {
    throw new AppError('Assigned slot is under maintenance', 409, 'SLOT_MAINTENANCE_NOT_AVAILABLE');
  }

  return reservation;
};

const findCapacityForBuilding = async (buildingId) => {
  const totalSlots = await ParkingSlot.countDocuments({ building: buildingId, status: { $ne: 'maintenance' } });
  const activeSessions = await ParkingSession.countDocuments({ building: buildingId, status: 'active' });
  return { totalSlots, activeSessions };
};

const checkIn = async (user, payload) => {
  const session = await mongoose.startSession();
  try {
    const result = await session.withTransaction(async () => {
      const buildingId = payload?.building;
      const plateNumber = normalizePlate(payload?.plateNumber);
      const vehicleType = asObjectId(payload?.vehicleType);
      const gate = asObjectId(payload?.gate);
      const forceCheckIn = Boolean(payload?.forceCheckIn);

      if (!buildingId) {
        throw new AppError('building is required', 400);
      }
      if (!plateNumber) {
        throw new AppError('plateNumber is required', 400);
      }

      const allowedBuildings = assertBuildingScope(user, buildingId);
      const building = await buildingRepository.findById(buildingId);
      if (!building) {
        throw new AppError('Building not found', 404);
      }

      const { totalSlots, activeSessions } = await findCapacityForBuilding(buildingId);
      if (totalSlots > 0 && activeSessions >= totalSlots) {
        throw new AppError('Building is at capacity', 409);
      }

      const duplicate = await findDuplicateActiveSession(plateNumber);
      if (duplicate && !forceCheckIn) {
        throw new AppError('Duplicate active plate detected', 400, 'DUPLICATE_PLATE_WARNING');
      }

      const longTerm = await resolveLongTermSubscription(plateNumber, allowedBuildings);
      if (longTerm) {
        const created = await ParkingSession.create(
          [{
            plateNumber,
            building: buildingId,
            staff: user._id,
            user: longTerm.user,
            fee: 0,
            paymentMethod: 'long_term',
            vehicleType,
            entryGate: gate,
            note: `long_term:${longTerm._id}`,
          }],
          { session },
        );

        await logAudit(session, {
          actor: user._id,
          action: 'LONG_TERM_SUBSCRIPTION_CHECK_IN',
          entityType: 'ParkingSession',
          entityId: `${created[0]._id}`,
          building: buildingId,
          after: created[0].toObject(),
          metadata: { plateNumber, longTermSubscriptionId: `${longTerm._id}` },
        });

        return created[0];
      }

      const reservation = await resolveReservation(plateNumber, allowedBuildings);
      const slotId = reservation?.slot?._id || reservation?.slot || null;
      if (slotId) {
        const slot = await ParkingSlot.findById(slotId).session(session);
        if (slot?.status === 'maintenance') {
          throw new AppError('Assigned slot is under maintenance', 409, 'SLOT_MAINTENANCE_NOT_AVAILABLE');
        }
        if (slot) {
          slot.status = 'occupied';
          await slot.save({ session });
        }
        reservation.status = 'checked_in';
        reservation.checkedInAt = new Date();
        await reservation.save({ session });
      }

      const created = await ParkingSession.create(
        [{
          plateNumber,
          building: buildingId,
          staff: user._id,
          user: reservation?.user || registerUser?._id || null,
          reservation: reservation?._id || null,
          slot: slotId,
          vehicleType,
          entryGate: gate,
          note: reservation
            ? 'reservation_check_in'
            : duplicate && forceCheckIn
              ? 'duplicate_bypassed'
              : '',
        }],
        { session },
      );

      await logAudit(session, {
        actor: user._id,
        action: duplicate && forceCheckIn
          ? 'DUPLICATE_PLATE_BYPASS'
          : reservation
            ? 'RESERVATION_CHECK_IN'
            : 'PARKING_SESSION_CHECK_IN',
        entityType: 'ParkingSession',
        entityId: `${created[0]._id}`,
        building: buildingId,
        after: created[0].toObject(),
        metadata: {
          plateNumber,
          duplicatePlateWarning: Boolean(duplicate),
          forceCheckIn,
          reservationId: reservation ? `${reservation._id}` : null,
        },
      });

      return created[0];
    });

    return result;
  } finally {
    session.endSession();
  }
};

const checkOut = async (user, sessionId, payload = {}) => {
  const mongoSession = await mongoose.startSession();
  try {
    const result = await mongoSession.withTransaction(async () => {
      if (!sessionId) {
        throw new AppError('sessionId is required', 400, 'SESSION_ID_REQUIRED');
      }

      const parkingSession = await ParkingSession.findById(sessionId).session(mongoSession);
      if (!parkingSession) {
        throw new AppError('Parking session not found', 404, 'SESSION_NOT_FOUND');
      }

      assertBuildingScope(user, parkingSession.building);

      if (parkingSession.status !== 'active') {
        throw new AppError('Session not active', 400);
      }

      const providedPlate = normalizePlate(payload.plateNumber || payload.exitPlateNumber);
      if (providedPlate && providedPlate !== normalizePlate(parkingSession.plateNumber) && !payload.bypassMismatch) {
        throw new AppError('Plate mismatch requires bypass confirmation', 409, 'PLATE_MISMATCH_WARNING');
      }

      const feeMethod = payload.paymentMethod || 'cash';
      let fee = Number(parkingSession.fee || 0);
      if (!fee) {
        const ms = Date.now() - new Date(parkingSession.entryTime).getTime();
        fee = Math.max(1, Math.ceil(ms / (1000 * 60 * 60)));
      }

      if (payload.adjustedFee !== undefined && payload.adjustedFee !== null) {
        if (!payload.adjustmentReason) {
          throw new AppError('adjustmentReason is required when adjustedFee is provided', 400, 'ADJUSTMENT_REASON_REQUIRED');
        }
        if (Number.isNaN(Number(payload.adjustedFee)) || Number(payload.adjustedFee) < 0) {
          throw new AppError('adjustedFee must be a non-negative number', 400, 'INVALID_ADJUSTED_FEE');
        }
        fee = Number(payload.adjustedFee);
      }

      if (payload.forceCheckoutReason) {
        const surcharge = Math.max(1, Math.ceil(fee * 0.25));
        fee += surcharge;
      }

      let walletTx = null;
      if (feeMethod === 'wallet') {
        const paidUser = await User.findOneAndUpdate(
          { _id: user._id, walletBalance: { $gte: fee } },
          { $inc: { walletBalance: -fee } },
          { new: true, session: mongoSession },
        );
        if (!paidUser) throw new AppError('Insufficient wallet balance', 409, 'INSUFFICIENT_WALLET_BALANCE');
        walletTx = await WalletTransaction.create(
          [{
            user: user._id,
            type: 'debit',
            amount: fee,
            balanceAfter: paidUser.walletBalance,
            status: 'success',
            reason: 'parking_checkout',
            metadata: { sessionId: `${parkingSession._id}` },
          }],
          { session: mongoSession },
        );
      }

      const [payment] = await Payment.create(
        [{
          building: parkingSession.building,
          parkingSession: parkingSession._id,
          type: 'session',
          method: feeMethod,
          amount: fee,
          status: 'success',
          user: parkingSession.user || null,
          staff: user._id,
          note: [payload.adjustmentReason, payload.forceCheckoutReason].filter(Boolean).join(' | '),
        }],
        { session: mongoSession },
      );

      // Credit tiền phí gửi xe vào BuildingWallet (áp dụng mọi method thanh toán)
      if (fee > 0) {
        await buildingWalletService.credit(
          parkingSession.building,
          fee,
          'parking_fee',
          payment._id,
          mongoSession,
        );
      }

      parkingSession.exitTime = new Date();
      parkingSession.status = 'completed';
      parkingSession.fee = fee;
      parkingSession.paymentMethod = feeMethod;
      parkingSession.note = [parkingSession.note, payload.forceCheckoutReason, payload.bypassMismatch ? 'plate_mismatch_bypassed' : null]
        .filter(Boolean)
        .join(' | ');
      await parkingSession.save({ session: mongoSession });

      if (parkingSession.slot) {
        const slot = await ParkingSlot.findById(parkingSession.slot).session(mongoSession);
        if (slot && slot.status !== 'maintenance') {
          slot.status = 'available';
          await slot.save({ session: mongoSession });
        }
      }

      await logAudit(mongoSession, {
        actor: user._id,
        action: payload.forceCheckoutReason
          ? 'FORCE_VEHICLE_CHECKOUT'
          : payload.adjustedFee !== undefined && payload.adjustedFee !== null
            ? 'OVERRIDE_FEE_CALCULATION'
            : payload.bypassMismatch
              ? 'PLATE_MISMATCH_BYPASS'
              : 'PARKING_SESSION_CHECK_OUT',
        entityType: 'ParkingSession',
        entityId: `${parkingSession._id}`,
        building: parkingSession.building,
        after: parkingSession.toObject(),
        metadata: {
          paymentMethod: feeMethod,
          adjustedFee: payload.adjustedFee ?? null,
          adjustmentReason: payload.adjustmentReason || null,
          forceCheckoutReason: payload.forceCheckoutReason || null,
          bypassMismatch: Boolean(payload.bypassMismatch),
        },
      });

      return parkingSession;
    });

    return result;
  } finally {
    mongoSession.endSession();
  }
};

const listActive = async (user, query = {}) => {
  const allowedBuildings = assertBuildingScope(user, query.buildingId || query.building);
  const buildingFilter = query.buildingId || query.building
    ? { building: query.buildingId || query.building }
    : { building: { $in: allowedBuildings } };

  return ParkingSession.find({ ...buildingFilter, status: 'active' })
    .sort({ checkIn: -1 })
    .populate('entryGate', 'code name')
    .populate('vehicleType', 'name code');
};

const getById = async (user, id) => {
  if (!id) {
    throw new AppError('sessionId is required', 400, 'SESSION_ID_REQUIRED');
  }

  const parkingSession = await ParkingSession.findById(id)
    .populate('entryGate', 'code name')
    .populate('vehicleType', 'name code');
  if (!parkingSession) {
    throw new AppError('Parking session not found', 404, 'SESSION_NOT_FOUND');
  }

  assertBuildingScope(user, parkingSession.building);

  return parkingSession;
};

const search = async (user, plate, query = {}) => {
  const allowedBuildings = assertBuildingScope(user, query.buildingId || query.building);
  if (!plate) {
    return [];
  }

  const buildingFilter = query.buildingId || query.building
    ? { building: query.buildingId || query.building }
    : { building: { $in: allowedBuildings } };

  return ParkingSession.find({
    ...buildingFilter,
    plateNumber: { $regex: `${plate}`.trim(), $options: 'i' },
  })
    .sort({ checkIn: -1 })
    .populate('entryGate', 'code name')
    .populate('vehicleType', 'name code');
};

/* ─────────────────────────────────────────────
   lookupPlate
   Identifies whether a plate belongs to a registered user.
   Used by staff at entry gate to decide payment options.
───────────────────────────────────────────── */

const lookupPlate = async (staffUser, plateNumber) => {
  const plate = normalizePlate(plateNumber);
  if (!plate) throw new AppError('plateNumber is required', 400);

  // Must be scoped to at least one building
  const allowedBuildings = assignedBuildingIds(staffUser);
  if (!allowedBuildings.length) {
    throw new AppError('No assigned buildings for this staff user', 403, 'FORBIDDEN_BUILDING_SCOPE');
  }

  const [user, activeSession] = await Promise.all([
    User.findOne({ 'licensePlates.plateNumber': plate })
      .select('fullName email phone walletBalance'),
    ParkingSession.findOne({ plateNumber: plate, status: 'active' })
      .select('_id building entryTime'),
  ]);

  return {
    plateNumber: plate,
    hasAccount: Boolean(user),
    user: user
      ? {
          id: user._id,
          fullName: user.fullName,
          email: user.email,
          phone: user.phone || null,
          walletBalance: user.walletBalance,
        }
      : null,
    activeSession: activeSession
      ? { id: activeSession._id, building: activeSession.building, entryTime: activeSession.entryTime }
      : null,
  };
};

/* ─────────────────────────────────────────────
   initiateStripePayment
   Creates a Stripe Payment Intent for the parking session fee.
   The session stays "active" until the webhook confirms payment.
───────────────────────────────────────────── */

/**
 * Calculate fee (hours elapsed, minimum 1 hour).
 * Mirrors the logic inside checkOut so both paths agree.
 */
const calculateFee = (parkingSession) => {
  if (parkingSession.fee && parkingSession.fee > 0) return parkingSession.fee;
  const ms = Date.now() - new Date(parkingSession.entryTime).getTime();
  return Math.max(1, Math.ceil(ms / (1000 * 60 * 60)));
};

/**
 * Tạo PayOS payment link để thu phí gửi xe trực tiếp.
 * Staff nhận checkoutUrl + qrCode → hiển thị QR cho khách quét.
 * Session giữ nguyên "active" cho đến khi webhook xác nhận thanh toán.
 */
const initiatePayment = async (staffUser, sessionId) => {
  if (!sessionId) throw new AppError('sessionId is required', 400);

  const parkingSession = await ParkingSession.findById(sessionId);
  if (!parkingSession) throw new AppError('Parking session not found', 404, 'SESSION_NOT_FOUND');

  assertBuildingScope(staffUser, parkingSession.building);

  if (parkingSession.status !== 'active') {
    throw new AppError('Session is not active', 400, 'SESSION_NOT_ACTIVE');
  }

  const fee = calculateFee(parkingSession);
  const orderCode = payosService.generateOrderCode();

  const { checkoutUrl, qrCode, paymentLinkId } = await payosService.createPaymentLink({
    orderCode,
    amount: fee,
    description: 'Phi giu xe PBMS',
  });

  // Persist pending Payment — webhook will complete the session
  await Payment.create({
    building: parkingSession.building,
    parkingSession: parkingSession._id,
    type: 'session',
    method: 'payos',
    amount: fee,
    status: 'pending',
    user: parkingSession.user || null,
    staff: staffUser._id,
    payosOrderCode: orderCode,
    payosPaymentLinkId: paymentLinkId,
    note: 'Parking fee via PayOS QR',
  });

  return {
    checkoutUrl,
    qrCode,
    orderCode,
    amount: fee,
    plateNumber: parkingSession.plateNumber,
    entryTime: parkingSession.entryTime,
  };
};

/* ─────────────────────────────────────────────
   settleSessionPayment
   Complete a parking session paid via PayOS (bank transfer / VietQR) — race-safe
   & idempotent. Shared by the PayOS webhook and the manual verify endpoint.
   Atomically flips the pending Payment → success so only one caller completes the
   session + credits the manager (building) wallet; never double-credits.
───────────────────────────────────────────── */
const settleSessionPayment = async (orderCode) => {
  const oc = Number(orderCode);
  const mongoSession = await mongoose.startSession();
  let result = { settled: false, status: 'already_processed' };
  try {
    await mongoSession.withTransaction(async () => {
      const payment = await Payment.findOneAndUpdate(
        { payosOrderCode: oc, type: 'session', status: 'pending' },
        { status: 'success' },
        { new: true, session: mongoSession },
      );
      if (!payment) return; // already processed / unknown → no-op

      const ps = await ParkingSession.findById(payment.parkingSession).session(mongoSession);
      if (!ps) throw new AppError('Parking session not found', 404, 'SESSION_NOT_FOUND');

      if (ps.status === 'active') {
        ps.exitTime = new Date();
        ps.status = 'completed';
        ps.fee = payment.amount;
        ps.paymentMethod = 'payos';
        await ps.save({ session: mongoSession });

        if (ps.slot) {
          const slot = await ParkingSlot.findById(ps.slot).session(mongoSession);
          if (slot && slot.status !== 'maintenance') {
            slot.status = 'available';
            await slot.save({ session: mongoSession });
          }
        }

        // Credit the manager (building) wallet — same as the cash path.
        if (payment.amount > 0) {
          await buildingWalletService.credit(
            ps.building, payment.amount, 'parking_fee', payment._id, mongoSession,
          );
        }
      }

      result = { settled: true, status: 'success' };
    });
    return result;
  } catch (err) {
    if (err && err.code === 11000) return { settled: false, status: 'already_processed' };
    throw err;
  } finally {
    mongoSession.endSession();
  }
};

/* ─────────────────────────────────────────────
   verifySessionPayment
   Reconcile a session payment with PayOS — fallback when the webhook never
   reaches the server. Credits the wallet (via settleSessionPayment) if PAID.
───────────────────────────────────────────── */
const verifySessionPayment = async (staffUser, orderCode) => {
  const oc = Number(orderCode);
  if (!oc) throw new AppError('Invalid orderCode', 400);

  const payment = await Payment.findOne({ payosOrderCode: oc, type: 'session' });
  if (!payment) throw new AppError('Payment order not found', 404);
  assertBuildingScope(staffUser, payment.building);

  if (payment.status === 'success') {
    return { status: 'success', settled: false };
  }

  let info;
  try {
    info = await payosService.getPaymentLink(oc);
  } catch (err) {
    throw new AppError(`Could not verify payment with PayOS: ${err.message}`, 502);
  }

  const payosStatus = String(info?.status || '').toUpperCase();
  if (payosStatus === 'PAID') {
    const r = await settleSessionPayment(oc);
    return { status: 'success', settled: r.settled };
  }
  return { status: payosStatus.toLowerCase() || 'pending', settled: false };
};

module.exports = { checkIn, checkOut, listActive, getById, search, lookupPlate, initiatePayment, settleSessionPayment, verifySessionPayment };
