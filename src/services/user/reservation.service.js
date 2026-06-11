const mongoose = require('mongoose');
const Reservation = require('../../models/operations/Reservation');
const ParkingSession = require('../../models/operations/ParkingSession');
const Building = require('../../models/building/Building');
const VehicleType = require('../../models/building/VehicleType');
const Floor = require('../../models/building/Floor');
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

// % hoàn tiền khi hủy do MANAGER cấu hình trong ReservationPolicy.refundPercent.
// % cọc khi đặt chỗ do MANAGER cấu hình trong ReservationPolicy.depositPercent
// (mỗi building riêng). Phần còn lại (100 - depositPercent) thu sau khi checkout.

// Đặt chỗ chỉ theo số giờ NGUYÊN (1, 2, 3... giờ) — không cho phép 1h30 hay 45 phút.
// Dùng chung cho cả create và estimate để FE/BE thống nhất.
const assertWholeHourDuration = (start, end) => {
  const durationMs = end.getTime() - start.getTime();
  const durationHours = durationMs / 3_600_000;
  if (!Number.isInteger(durationHours) || durationHours < 1) {
    throw new AppError(
      'Thời lượng đặt chỗ phải là số giờ nguyên (1, 2, 3... giờ). Không hỗ trợ 30 hay 45 phút.',
      400,
      'INVALID_RESERVATION_DURATION',
    );
  }
  return durationHours;
};

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

  // Gắn % hoàn tiền (theo chính sách của từng tòa nhà) + số tiền đã hoàn thực tế
  // (với lượt đã hủy) để FE hiển thị đúng thay vì 0%.
  const buildingIds = [...new Set(docs.map((d) => String(d.building?._id || d.building)))];
  const policies = buildingIds.length
    ? await ReservationPolicy.find({ building: { $in: buildingIds } }).select('building refundPercent').lean()
    : [];
  const refundPctByBuilding = new Map(policies.map((p) => [String(p.building), p.refundPercent ?? 0]));

  const cancelledIds = docs.filter((d) => d.status === 'cancelled').map((d) => d._id);
  const refundPayments = cancelledIds.length
    ? await Payment.find({ reservation: { $in: cancelledIds }, type: 'refund', status: 'success' })
        .select('reservation amount')
        .lean()
    : [];
  const refundAmtByRes = new Map(refundPayments.map((p) => [String(p.reservation), p.amount]));

  // Query associated parking sessions for these reservations
  const reservationIds = docs.map((d) => d._id);
  const sessions = await ParkingSession.find({ reservation: { $in: reservationIds } }).lean();

  const sessionsMap = {};
  sessions.forEach((s) => {
    if (s.reservation) {
      sessionsMap[s.reservation.toString()] = s;
    }
  });
  const items = docs.map((d) => {
    const session = sessionsMap[d._id.toString()] || null;
    return {
      ...d,
      refundPercent: refundPctByBuilding.get(String(d.building?._id || d.building)) ?? 0,
      refundAmount: refundAmtByRes.get(String(d._id)) ?? 0,
      parkingSession: session
        ? {
            _id: session._id,
            fee: session.fee,
            status: session.status,
            entryTime: session.entryTime,
            exitTime: session.exitTime,
            paymentStatus: session.paymentStatus,
          }
        : null,
      refundPercent: refundPctByBuilding.get(String(d.building?._id || d.building)) ?? 0,
      refundAmount: refundAmtByRes.get(String(d._id)) ?? 0,
    };
  });

  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
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

  // Chỉ cho phép đặt theo giờ nguyên (1, 2, 3... giờ).
  const durationHours = assertWholeHourDuration(start, end);

  // ── Giới hạn thời lượng tối đa/lượt do MANAGER cấu hình ────────────────────
  const maxDurationHours = Number(policy.maxDurationHours ?? 24);
  if (durationHours > maxDurationHours) {
    throw new AppError(
      `Thời lượng đặt chỗ tối đa là ${maxDurationHours} giờ/lượt theo chính sách của tòa nhà`,
      400,
    );
  }

  const now = new Date();
  if (start < new Date(now.getTime() - 60 * 60 * 1000)) {
    throw new AppError('Start time is too far in the past, please select a valid time.', 400);
  }

  // ── Cửa sổ đặt trước tối đa do MANAGER cấu hình (mặc định 7 ngày) ──────────
  const maxAdvanceDays = Number(policy.maxAdvanceDays ?? 7);
  const maxAllowedStart = new Date(now.getTime() + maxAdvanceDays * 24 * 60 * 60 * 1000);
  if (start > maxAllowedStart) {
    throw new AppError(`Chỉ được phép đặt trước chỗ đỗ tối đa ${maxAdvanceDays} ngày`, 400);
  }

  // ── 5. Validate & assign slot ──────────────────────────────────────────────
  let resolvedSlotId = null;
  if (slotId) {
    // Tìm theo _id + status; xác thực thuộc tòa nhà qua FLOOR (không lọc trực tiếp
    // bằng slot.building để tránh lệch dữ liệu khiến đặt chỗ thất bại).
    const slot = await ParkingSlot.findOne({ _id: slotId, status: 'available' });
    if (!slot) throw new AppError('Slot is no longer available or invalid', 409);
    const slotFloor = await Floor.findOne({ _id: slot.floor, building: resolvedBuildingId }).select('_id');
    if (!slotFloor) throw new AppError('Ô đỗ không thuộc tòa nhà này', 409, 'SLOT_BUILDING_MISMATCH');
    // Ô đỗ phải cho phép đặt trước.
    if (slot.reservable === false) {
      throw new AppError('Ô đỗ này không cho phép đặt trước', 409, 'SLOT_NOT_RESERVABLE');
    }
    // Ô đỗ có giới hạn loại xe (vehicleType != null) thì phải khớp loại xe đặt.
    // vehicleType == null nghĩa là ô nhận mọi loại xe.
    if (
      slot.vehicleType &&
      resolvedVehicleTypeId &&
      `${slot.vehicleType}` !== `${resolvedVehicleTypeId}`
    ) {
      throw new AppError(
        'Ô đỗ không phù hợp với loại xe của bạn. Vui lòng chọn ô khác.',
        409,
        'SLOT_VEHICLE_TYPE_MISMATCH',
      );
    }
    resolvedSlotId = slot._id;
  }

  // ── 6. Calculate estimated fee + deposit theo % do MANAGER cấu hình ──────────
  const { estimatedFee } = await calculateReservationFee(
    resolvedBuildingId, resolvedVehicleTypeId, start, end,
  );
  // % cọc lấy từ chính sách của tòa nhà (mỗi building set riêng). Phần còn lại
  // (100 - depositPercent) sẽ được thu sau khi checkout.
  const depositRate = Math.min(Math.max(Number(policy.depositPercent ?? 15), 0), 100) / 100;
  const depositAmount = Math.ceil(estimatedFee * depositRate);

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

      // Số tiền cọc đã thu khi đặt.
      const paidPayment = await Payment.findOne({
        reservation: reservation._id,
        type: 'reservation',
        status: 'success',
      }).session(mongoSession);
      const amountPaid = paidPayment?.amount ?? (Number(reservation.fee) || 0);

      // % hoàn tiền do MANAGER cấu hình trong ReservationPolicy của tòa nhà.
      const policy = await ReservationPolicy.findOne({ building: reservation.building }).session(mongoSession);
      const refundPercent = Math.min(Math.max(Number(policy?.refundPercent ?? 0), 0), 100);
      const refund = Math.round((amountPaid * refundPercent) / 100);

      // Release the reserved slot.
      if (reservation.slot) {
        await ParkingSlot.findByIdAndUpdate(reservation.slot, { status: 'available' }, { session: mongoSession });
      }

      reservation.status = 'cancelled';
      await reservation.save({ session: mongoSession });

      // Hoàn lại refundPercent% tiền cọc vào ví khách (phần còn lại tòa nhà giữ).
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
            metadata: { reservationId: `${reservation._id}`, code: reservation.code, percent: refundPercent },
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
            note: `Reservation ${reservation.code} cancelled — ${refundPercent}% refund of deposit`,
          }],
          { session: mongoSession },
        );

        await buildingWalletService.debit(
          reservation.building, refund, 'refund', refundPayment._id, null, mongoSession,
        );
      }

      outcome = { reservation, refund, amountPaid, refundPercent };
    });
    return outcome;
  } finally {
    mongoSession.endSession();
  }
};

module.exports = { list, get, create, cancel, assertWholeHourDuration };
