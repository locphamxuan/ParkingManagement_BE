const mongoose = require('mongoose');
const AppError = require('../../utils/AppError');
const { Reservation, ParkingSession, ParkingSlot } = require('../../models');
const { assertBuildingScope, logAudit } = require('../../utils/staffScope');

const normalizeCode = (value) => `${value || ''}`.trim().toUpperCase();

const processReservationCheckIn = async (staffUser, payload = {}) => {
  const session = await mongoose.startSession();
  try {
    const result = await session.withTransaction(async () => {
      const code = normalizeCode(payload.code || payload.reservationCode);
      if (!code) {
        throw new AppError('reservationCode is required', 400, 'RESERVATION_CODE_REQUIRED');
      }

      const reservation = await Reservation.findOne({ code }).session(session);
      if (!reservation) {
        throw new AppError('Reservation not found', 404, 'RESERVATION_NOT_FOUND');
      }

      assertBuildingScope(staffUser, reservation.building);

      const now = Date.now();
      const endTime = reservation.endTime ? new Date(reservation.endTime).getTime() : null;
      if (endTime && endTime < now) {
        throw new AppError('Reservation expired', 409, 'RESERVATION_EXPIRED');
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
