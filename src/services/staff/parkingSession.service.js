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
  Notification,
  VehicleType,
} = require('../../models');
const { assignedBuildingIds, assertBuildingScope, logAudit } = require('../../utils/staffScope');
const payosService = require('../payment/payos.service');
const buildingWalletService = require('../manager/buildingWallet.service');
const { normalizePlate, isValidVietnamPlate, plateMatchRegex } = require('../../utils/plate.util');
const { calculateParkingFee } = require('../../utils/feeCalculator');
const visionScanService = require('./visionScan.service');
const { releaseSubscriptionSlot } = require('../user/longTerm.service');

// Fallback hourly rate (VND) by vehicle kind, used when no PricePolicy is configured.
const DEFAULT_HOURLY_RATE = { car: 20000, motorcycle: 5000 };

// Resolve a 'car'|'motorcycle' kind (or an ObjectId) to the building's VehicleType _id.
const resolveVehicleTypeId = async (buildingId, kind, session = null) => {
  if (!kind) return null;
  if (mongoose.Types.ObjectId.isValid(kind)) return kind;
  const k = `${kind}`.toLowerCase();
  const codes = k === 'motorcycle'
    ? ['MOTORCYCLE', 'MOTORBIKE', 'XE_MAY', 'BIKE', 'MOTO']
    : ['CAR', 'OTO', 'AUTO', 'XE_OTO'];
  const nameRx = k === 'motorcycle' ? /xe m|motor|máy/i : /ô t|oto|car|auto/i;
  const vt = await VehicleType.findOne({
    building: buildingId,
    $or: [{ code: { $in: codes } }, { name: nameRx }],
  }).session(session);
  return vt?._id || null;
};

// Map a VehicleType code/name to our two kinds for fallback pricing.
const vehicleKindFromType = (vt) => {
  const s = `${vt?.code || ''} ${vt?.name || ''}`.toLowerCase();
  if (/motor|xe m|máy|bike|moto/.test(s)) return 'motorcycle';
  return 'car';
};

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
    // Release dedicated slot when subscription expires
    await releaseSubscriptionSlot(subscription);
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
  const expiresAt = reservation.startTime ? new Date(reservation.startTime).getTime() + 30 * 60 * 1000 : null;
  const expired = expiresAt && expiresAt < now;

  if (expired) {
    reservation.status = 'expired';
    await reservation.save();
    // Nếu có giữ ô đỗ, hãy chuyển trạng thái ô đỗ về 'available'
    if (reservation.slot) {
      const ParkingSlot = require('../../models/building/ParkingSlot');
      await ParkingSlot.findByIdAndUpdate(reservation.slot, { status: 'available' });
    }
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
      // FE sends 'car'/'motorcycle'; resolve to the building's VehicleType _id so
      // pricing (by vehicle type) and reporting work. Falls back to null if unset.
      const vehicleType = await resolveVehicleTypeId(buildingId, payload?.vehicleType, session);
      const gate = asObjectId(payload?.gate);
      const forceCheckIn = Boolean(payload?.forceCheckIn);
      const vehicleBrand = payload?.vehicleBrand
        ? `${payload.vehicleBrand}`.trim()
        : null;
      // Camera snapshots saved for business-logic/evidence:
      //  - plateImage    : license-plate camera (Camera 1)
      //  - portraitImage : QR / account camera (Camera 2 — driver portrait)
      const plateImage = payload?.plateImage || null;
      const portraitImage = payload?.portraitImage || null;

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
            vehicleBrand,
            plateImage,
            portraitImage,
            entryGate: gate,
            slot: longTerm.slot || null,
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

      // Link the session to the plate's owner account when one exists (account is
      // the secondary identifier). Format-tolerant so 59G2-03880 / 59G2-038.80 match.
      const registeredOwner = await User.findOne({
        'licensePlates.plateNumber': plateMatchRegex(plateNumber) || plateNumber,
      })
        .select('_id')
        .session(session);

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
          user: reservation?.user || registeredOwner?._id || null,
          reservation: reservation?._id || null,
          slot: slotId,
          vehicleType,
          vehicleBrand,
          plateImage,
          portraitImage,
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

      const parkingSession = await ParkingSession.findById(sessionId)
        .populate('reservation')
        .populate('vehicleType', 'code name')
        .populate({ path: 'slot', select: 'floor', populate: { path: 'floor', select: '_id' } })
        .session(mongoSession);
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

      const linkedReservation = parkingSession.reservation;
      const isReservationCheckout = Boolean(linkedReservation);

      let fee;
      let feeMethod;
      let walletUserId = null;

      if (isReservationCheckout) {
        // Thu phần CÒN LẠI từ ví khách = tổng phí đã ghi khi đặt − tiền cọc đã thu.
        // (cọc = depositPercent% do manager set; còn lại = 100 − depositPercent%).
        // Đặt bao nhiêu tiếng thu đủ bấy nhiêu — checkout sớm vẫn thu đủ tiền đã đặt.
        const estimatedFee = Number(linkedReservation.estimatedFee || 0);
        const deposit = Number(linkedReservation.fee || 0);
        fee = Math.max(0, estimatedFee - deposit);
        feeMethod = 'wallet';
        walletUserId = linkedReservation.user;
      } else {
        feeMethod = payload.paymentMethod || 'cash';
        fee = Number(parkingSession.fee || 0);
        if (!fee) {
          const now = new Date();
          const floorId = parkingSession.slot?.floor?._id || parkingSession.slot?.floor || null;
          const vtId = parkingSession.vehicleType?._id || parkingSession.vehicleType || null;
          // Price by vehicle type via PricePolicy (peak/holiday/floor aware).
          fee = await calculateParkingFee(parkingSession.building, vtId, floorId, parkingSession.entryTime, now);
          if (!fee || fee <= 0) {
            // No PricePolicy configured → fallback to a flat hourly rate by vehicle kind.
            const kind = vehicleKindFromType(parkingSession.vehicleType);
            const hours = Math.max(1, Math.ceil((now.getTime() - new Date(parkingSession.entryTime).getTime()) / (1000 * 60 * 60)));
            fee = hours * (DEFAULT_HOURLY_RATE[kind] || DEFAULT_HOURLY_RATE.car);
          }
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
      }

      // Debit user wallet for reservation checkouts (remaining fee) or direct wallet payments.
      if (feeMethod === 'wallet' && fee > 0) {
        const targetUserId = walletUserId || parkingSession.user;
        if (!targetUserId) {
          throw new AppError('No user account linked to this session for wallet payment', 400);
        }
        const paidUser = await User.findOneAndUpdate(
          { _id: targetUserId, walletBalance: { $gte: fee } },
          { $inc: { walletBalance: -fee } },
          { new: true, session: mongoSession },
        );
        if (!paidUser) {
          throw new AppError(
            `Insufficient wallet balance to complete checkout. Remaining amount due: ${fee.toLocaleString('en-US')} VND`,
            409,
            'INSUFFICIENT_WALLET_BALANCE',
          );
        }
        await WalletTransaction.create(
          [{
            user: targetUserId,
            type: 'debit',
            amount: fee,
            balanceAfter: paidUser.walletBalance,
            status: 'success',
            reason: isReservationCheckout ? 'reservation_checkout' : 'parking_checkout',
            metadata: isReservationCheckout
              ? { sessionId: `${parkingSession._id}`, reservationId: `${linkedReservation._id}`, reservationCode: linkedReservation.code }
              : { sessionId: `${parkingSession._id}` },
          }],
          { session: mongoSession },
        );
      }

      const [payment] = await Payment.create(
        [{
          building: parkingSession.building,
          parkingSession: parkingSession._id,
          reservation: isReservationCheckout ? linkedReservation._id : null,
          type: 'session',
          method: feeMethod,
          amount: fee,
          status: 'success',
          user: (walletUserId || parkingSession.user) || null,
          staff: user._id,
          note: [
            isReservationCheckout ? `reservation_remaining:${linkedReservation.code}` : null,
            payload.adjustmentReason,
            payload.forceCheckoutReason,
          ].filter(Boolean).join(' | '),
        }],
        { session: mongoSession },
      );

      if (fee > 0) {
        await buildingWalletService.credit(
          parkingSession.building,
          fee,
          isReservationCheckout ? 'reservation_fee' : 'parking_fee',
          payment._id,
          mongoSession,
        );
      }

      // Mark linked reservation as completed.
      if (isReservationCheckout) {
        await Reservation.findByIdAndUpdate(
          linkedReservation._id,
          { status: 'completed' },
          { session: mongoSession },
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
        action: isReservationCheckout
          ? 'RESERVATION_CHECK_OUT'
          : payload.forceCheckoutReason
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
          isReservationCheckout,
          reservationId: isReservationCheckout ? `${linkedReservation._id}` : null,
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

  const sessions = await ParkingSession.find({ ...buildingFilter, status: 'active' })
    .sort({ entryTime: -1 })
    .populate('entryGate', 'code name direction')
    .populate('exitGate', 'code name direction')
    .populate('vehicleType', 'name code')
    .populate('user', 'fullName email')
    .populate('staff', 'fullName email')
    .populate({ path: 'slot', select: 'code floor', populate: { path: 'floor', select: 'name code' } });

  // Attach the current fee (per manager's PricePolicy, fallback by kind) + member flag
  // so the staff UI can show the amount and who owns the vehicle.
  return Promise.all(
    sessions.map(async (s) => {
      const obj = s.toObject();
      obj.currentFee = await calculateFee(s);
      obj.isMember = Boolean(s.user);
      return obj;
    })
  );
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

  // Separator-insensitive match so a plate stored in any equivalent format
  // (e.g. 59G2-03880 / 59G2-038.80) still resolves to its owner.
  const plateRx = plateMatchRegex(plate) || plate;

  const [user, activeSession] = await Promise.all([
    User.findOne({ 'licensePlates.plateNumber': plateRx })
      .select('fullName email phone walletBalance licensePlates'),
    ParkingSession.findOne({ plateNumber: plateRx, status: 'active' })
      .select('_id building entryTime'),
  ]);

  // The vehicle type registered for THIS plate (normalized to car|motorcycle),
  // so the gate can verify the actual vehicle matches what was registered.
  let registeredVehicleType = null;
  if (user) {
    const matched = (user.licensePlates || []).find((p) => plateRx.test ? plateRx.test(p.plateNumber) : p.plateNumber === plate);
    const t = `${matched?.vehicleType || ''}`.toLowerCase();
    if (t === 'motorcycle') registeredVehicleType = 'motorcycle';
    else if (t) registeredVehicleType = 'car'; // car/suv/truck/other → car
  }

  return {
    plateNumber: plate,
    hasAccount: Boolean(user),
    registeredVehicleType,
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
   scanVehicle (AI camera — Camera 1)
   Runs one Gemini vision call to read the plate + brand, then resolves the
   owner account by plate (account is the secondary identifier). When the plate
   is unreadable, the FE falls back to the QR camera (Camera 2).
───────────────────────────────────────────── */

const scanVehicle = async (staffUser, image) => {
  const allowedBuildings = assignedBuildingIds(staffUser);
  if (!allowedBuildings.length) {
    throw new AppError('No assigned buildings for this staff user', 403, 'FORBIDDEN_BUILDING_SCOPE');
  }

  const { plateNumber, plateConfidence, vehicleType, brand, brandConfidence } =
    await visionScanService.scanVehicleImage(image);

  // Resolve the owner account only when we have a valid plate.
  let account = { hasAccount: false, registeredVehicleType: null, user: null, activeSession: null };
  if (isValidVietnamPlate(plateNumber)) {
    const lookup = await lookupPlate(staffUser, plateNumber);
    account = {
      hasAccount: lookup.hasAccount,
      registeredVehicleType: lookup.registeredVehicleType,
      user: lookup.user,
      activeSession: lookup.activeSession,
    };
  }

  // Whether the camera-detected type contradicts the registered type.
  const vehicleTypeMismatch = Boolean(
    account.registeredVehicleType && vehicleType && account.registeredVehicleType !== vehicleType
  );

  return {
    plateNumber, // canonical VN form, or '' if unreadable
    plateConfidence,
    vehicleType, // detected by AI (car|motorcycle|null)
    brand,
    brandConfidence,
    vehicleTypeMismatch,
    ...account,
  };
};

/* ─────────────────────────────────────────────
   rejectEntry
   Staff rejects a check-in / check-out (e.g. vehicle type doesn't match the
   registered one). Notifies the plate's owner with the reason so they can
   verify/update their vehicle info. Does NOT create/modify a session.
───────────────────────────────────────────── */

const rejectEntry = async (staffUser, { plateNumber, stage, reason, building } = {}) => {
  const plate = normalizePlate(plateNumber);
  if (!plate) throw new AppError('plateNumber is required', 400);
  if (!reason || !`${reason}`.trim()) throw new AppError('reason is required', 400, 'REJECT_REASON_REQUIRED');

  const allowedBuildings = assignedBuildingIds(staffUser);
  if (!allowedBuildings.length) {
    throw new AppError('No assigned buildings for this staff user', 403, 'FORBIDDEN_BUILDING_SCOPE');
  }

  const isCheckout = stage === 'check-out';
  const owner = await User.findOne({ 'licensePlates.plateNumber': plateMatchRegex(plate) || plate }).select('_id');

  let notified = false;
  if (owner) {
    await Notification.create({
      user: owner._id,
      type: isCheckout ? 'checkout_rejected' : 'checkin_rejected',
      title: isCheckout ? 'Check-out bị từ chối' : 'Check-in bị từ chối',
      message: `Biển số ${plate} bị từ chối ${isCheckout ? 'cho xe ra' : 'cho xe vào'}. Lý do: ${`${reason}`.trim()}. Vui lòng kiểm tra/cập nhật lại thông tin phương tiện.`,
      plateNumber: plate,
      building: asObjectId(building) || null,
    });
    notified = true;
  }

  await logAudit(null, {
    actor: staffUser._id,
    action: isCheckout ? 'CHECK_OUT_REJECTED' : 'CHECK_IN_REJECTED',
    entityType: 'ParkingSession',
    entityId: plate,
    building: asObjectId(building) || null,
    metadata: { plateNumber: plate, reason: `${reason}`.trim(), notified },
  });

  return { plateNumber: plate, stage: isCheckout ? 'check-out' : 'check-in', notified };
};

/* ─────────────────────────────────────────────
   initiateStripePayment
   Creates a Stripe Payment Intent for the parking session fee.
   The session stays "active" until the webhook confirms payment.
───────────────────────────────────────────── */

/**
 * Compute the parking fee (VND) for a session — price by vehicle type via
 * PricePolicy, falling back to a flat hourly rate by kind. Mirrors checkOut.
 */
const calculateFee = async (parkingSession) => {
  if (parkingSession.fee && parkingSession.fee > 0) return parkingSession.fee;
  const now = new Date();
  const floorId = parkingSession.slot?.floor?._id || parkingSession.slot?.floor || null;
  const vtId = parkingSession.vehicleType?._id || parkingSession.vehicleType || null;
  let fee = await calculateParkingFee(parkingSession.building, vtId, floorId, parkingSession.entryTime, now);
  if (!fee || fee <= 0) {
    const kind = vehicleKindFromType(parkingSession.vehicleType);
    const hours = Math.max(1, Math.ceil((now.getTime() - new Date(parkingSession.entryTime).getTime()) / (1000 * 60 * 60)));
    fee = hours * (DEFAULT_HOURLY_RATE[kind] || DEFAULT_HOURLY_RATE.car);
  }
  return fee;
};

/**
 * Tạo PayOS payment link để thu phí gửi xe trực tiếp.
 * Staff nhận checkoutUrl + qrCode → hiển thị QR cho khách quét.
 * Session giữ nguyên "active" cho đến khi webhook xác nhận thanh toán.
 */
const initiatePayment = async (staffUser, sessionId) => {
  if (!sessionId) throw new AppError('sessionId is required', 400);

  const parkingSession = await ParkingSession.findById(sessionId)
    .populate('vehicleType', 'code name')
    .populate({ path: 'slot', select: 'floor', populate: { path: 'floor', select: '_id' } });
  if (!parkingSession) throw new AppError('Parking session not found', 404, 'SESSION_NOT_FOUND');

  assertBuildingScope(staffUser, parkingSession.building);

  if (parkingSession.status !== 'active') {
    throw new AppError('Session is not active', 400, 'SESSION_NOT_ACTIVE');
  }

  const fee = await calculateFee(parkingSession);
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

module.exports = { checkIn, checkOut, listActive, getById, search, lookupPlate, scanVehicle, rejectEntry, initiatePayment, settleSessionPayment, verifySessionPayment };
