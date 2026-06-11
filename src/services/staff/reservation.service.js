const mongoose = require('mongoose');
const AppError = require('../../utils/AppError');
const { Reservation, ParkingSession, ParkingSlot } = require('../../models');
const { assertBuildingScope, logAudit } = require('../../utils/staffScope');
const { normalizePlate } = require('../../utils/plate.util');

const normalizeCode = (value) => `${value || ''}`.trim().toUpperCase();

// Tìm reservation linh hoạt: chấp nhận _id (ObjectId), mã code (RSV-...), hoặc
// biển số xe — vì màn hình hiển thị _id cho khách, còn QR có thể là code/_id/biển.
const CHECKINABLE_STATUSES = ['pending', 'confirmed'];
const findReservationByAnyRef = async (raw, session) => {
  const value = `${raw || ''}`.trim();
  if (!value) return null;

  if (mongoose.Types.ObjectId.isValid(value)) {
    const byId = await Reservation.findById(value).session(session);
    if (byId) return byId;
  }
  const byCode = await Reservation.findOne({ code: normalizeCode(value) }).session(session);
  if (byCode) return byCode;

  // Thử theo biển số (lượt đặt còn hiệu lực gần nhất).
  const plate = normalizePlate(value);
  if (plate) {
    return Reservation.findOne({ plateNumber: plate, status: { $in: CHECKINABLE_STATUSES } })
      .sort({ startTime: 1 })
      .session(session);
  }
  return null;
};

const processReservationCheckIn = async (staffUser, payload = {}) => {
  const session = await mongoose.startSession();
  try {
    const result = await session.withTransaction(async () => {
      const raw = `${payload.code || payload.reservationCode || ''}`.trim();
      if (!raw) {
        throw new AppError('reservationCode is required', 400, 'RESERVATION_CODE_REQUIRED');
      }

      const reservation = await findReservationByAnyRef(raw, session);
      if (!reservation) {
        throw new AppError('Không tìm thấy lượt đặt chỗ', 404, 'RESERVATION_NOT_FOUND');
      }

      assertBuildingScope(staffUser, reservation.building);
      // Chỉ check-in được lượt đang chờ/đã xác nhận.
      if (reservation.status === 'checked_in') {
        throw new AppError('Lượt đặt chỗ này đã được check-in trước đó', 409, 'RESERVATION_ALREADY_CHECKED_IN');
      }
      if (!CHECKINABLE_STATUSES.includes(reservation.status)) {
        throw new AppError(
          `Không thể check-in lượt đặt ở trạng thái "${reservation.status}"`,
          409,
          'RESERVATION_NOT_CHECKINABLE',
        );
      }

      const now = Date.now();
      const expirationTime = reservation.startTime ? new Date(reservation.startTime).getTime() + 30 * 60 * 1000 : null;
      if (expirationTime && expirationTime < now) {
        reservation.status = 'expired';
        await reservation.save({ session });
        throw new AppError('Lượt đặt chỗ đã hết hạn (quá 30 phút so với giờ bắt đầu)', 409, 'RESERVATION_EXPIRED');
      }

      const slotId = reservation.slot?._id || reservation.slot || null;
      if (slotId) {
        const slot = await ParkingSlot.findById(slotId).session(session);
        if (slot?.status === 'maintenance') {
          throw new AppError('Assigned slot is under maintenance', 409, 'SLOT_MAINTENANCE_NOT_AVAILABLE');
        }
        if (slot) {
          slot.status = 'occupied';
          await slot.save({ session });
        }
      }

      const previousValue = reservation.toObject();
      reservation.status = 'checked_in';
      await reservation.save({ session });

      const createdSession = await ParkingSession.create([
        {
          building: reservation.building,
          slot: slotId,
          vehicleType: reservation.vehicleType,
          plateNumber: reservation.plateNumber,
          user: reservation.user,
          staff: staffUser._id,
          entryGate: payload.entryGate || null,
          fee: 0,
          paymentMethod: null,
          status: 'active',
          note: `reservation_check_in:${reservation.code}`,
          reservation: reservation._id,
        },
      ], { session });

      await logAudit(session, {
        actor: staffUser._id,
        action: 'RESERVATION_CHECK_IN',
        entityType: 'Reservation',
        entityId: `${reservation._id}`,
        building: reservation.building,
        before: previousValue,
        after: reservation.toObject(),
        severity: 'low',
        description: `Reservation ${reservation.code} checked in`,
      });

      return {
        reservation,
        parkingSession: createdSession[0],
      };
    });

    return result;
  } finally {
    session.endSession();
  }
};

const expireReservation = async (staffUser, payload = {}) => {
  const session = await mongoose.startSession();
  try {
    const result = await session.withTransaction(async () => {
      const reservationId = payload.reservationId || payload.id || null;
      const code = normalizeCode(payload.code || payload.reservationCode);

      let reservation = null;
      if (reservationId) {
        reservation = await Reservation.findById(reservationId).session(session);
      } else if (code) {
        reservation = await Reservation.findOne({ code }).session(session);
      }

      if (!reservation) {
        throw new AppError('Reservation not found', 404, 'RESERVATION_NOT_FOUND');
      }

      assertBuildingScope(staffUser, reservation.building);

      const previousValue = reservation.toObject();
      reservation.status = 'expired';
      await reservation.save({ session });

      const slotId = reservation.slot?._id || reservation.slot || null;
      if (slotId) {
        const slot = await ParkingSlot.findById(slotId).session(session);
        if (slot && slot.status !== 'maintenance') {
          slot.status = 'available';
          await slot.save({ session });
        }
      }

      await logAudit(session, {
        actor: staffUser._id,
        action: 'RESERVATION_EXPIRED_CLEANUP',
        entityType: 'Reservation',
        entityId: `${reservation._id}`,
        building: reservation.building,
        before: previousValue,
        after: reservation.toObject(),
        severity: 'low',
        description: `Reservation ${reservation.code} expired and cleaned up`,
      });

      return reservation;
    });

    return result;
  } finally {
    session.endSession();
  }
};

module.exports = { processReservationCheckIn, expireReservation };
