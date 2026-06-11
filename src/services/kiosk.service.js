const mongoose = require('mongoose');
const AppError = require('../utils/AppError');
const { Reservation, ParkingSession, ParkingSlot, User } = require('../models');
const { logAudit } = require('../utils/staffScope');
const { normalizePlate, plateMatchRegex } = require('../utils/plate.util');

/**
 * Resolve a vehicle QR token (PLT-...) or a raw plate number to a canonical
 * plate string + its owner. Used by the self-service gate kiosk so a reservation
 * driver can check in WITHOUT going through a staff member.
 */
const resolvePlateFromQr = async ({ qrCode, plateNumber }) => {
  const token = `${qrCode || ''}`.trim();
  if (token) {
    const owner = await User.findOne({ 'licensePlates.qrCode': token }).select('licensePlates');
    if (owner) {
      const plate = (owner.licensePlates || []).find((p) => p.qrCode === token);
      if (plate?.plateNumber) {
        return { plateNumber: normalizePlate(plate.plateNumber) || plate.plateNumber, user: owner._id };
      }
    }
    // Token might itself be a plain plate string scanned from a QR.
    const asPlate = normalizePlate(token);
    if (asPlate) return { plateNumber: asPlate, user: null };
    throw new AppError('Mã QR phương tiện không hợp lệ hoặc chưa được đăng ký.', 404, 'KIOSK_QR_NOT_FOUND');
  }

  const plate = normalizePlate(plateNumber);
  if (!plate) throw new AppError('qrCode hoặc plateNumber là bắt buộc', 400, 'KIOSK_INPUT_REQUIRED');
  return { plateNumber: plate, user: null };
};

/**
 * selfCheckInByQr
 * Gate-kiosk reservation check-in. Scans the vehicle QR, finds a valid (pending/
 * confirmed) reservation for that plate and admits the vehicle automatically —
 * no staff involved. Stores the camera snapshots (plate + portrait) for evidence.
 */
const selfCheckInByQr = async (payload = {}) => {
  const { plateNumber } = await resolvePlateFromQr(payload);
  const plateImage = payload.plateImage || null;
  const portraitImage = payload.portraitImage || null;

  const session = await mongoose.startSession();
  try {
    const result = await session.withTransaction(async () => {
      const reservation = await Reservation.findOne({
        plateNumber: plateMatchRegex(plateNumber) || plateNumber,
        status: { $in: ['pending', 'confirmed'] },
      })
        .sort({ startTime: 1 })
        .session(session);

      if (!reservation) {
        throw new AppError(
          'Không tìm thấy đặt chỗ hợp lệ cho phương tiện này. Vui lòng liên hệ nhân viên.',
          404,
          'RESERVATION_NOT_FOUND',
        );
      }

      const now = Date.now();
      const endTime = reservation.endTime ? new Date(reservation.endTime).getTime() : null;
      if (endTime && endTime < now) {
        reservation.status = 'expired';
        await reservation.save({ session });
        throw new AppError('Lượt đặt chỗ đã hết hạn.', 409, 'RESERVATION_EXPIRED');
      }

      const slotId = reservation.slot?._id || reservation.slot || null;
      if (slotId) {
        const slot = await ParkingSlot.findById(slotId).session(session);
        if (slot?.status === 'maintenance') {
          throw new AppError('Ô đỗ được gán đang bảo trì.', 409, 'SLOT_MAINTENANCE_NOT_AVAILABLE');
        }
        if (slot) {
          slot.status = 'occupied';
          await slot.save({ session });
        }
      }

      const previousValue = reservation.toObject();
      reservation.status = 'checked_in';
      reservation.checkedInAt = new Date();
      await reservation.save({ session });

      const created = await ParkingSession.create(
        [
          {
            building: reservation.building,
            slot: slotId,
            vehicleType: reservation.vehicleType,
            plateNumber: reservation.plateNumber,
            user: reservation.user,
            staff: null,
            entryGate: payload.gate || null,
            fee: 0,
            paymentMethod: null,
            status: 'active',
            plateImage,
            portraitImage,
            note: `kiosk_self_check_in:${reservation.code}`,
            reservation: reservation._id,
          },
        ],
        { session },
      );

      await logAudit(session, {
        actor: reservation.user,
        action: 'RESERVATION_SELF_CHECK_IN',
        entityType: 'Reservation',
        entityId: `${reservation._id}`,
        building: reservation.building,
        before: previousValue,
        after: reservation.toObject(),
        severity: 'low',
        description: `Reservation ${reservation.code} self check-in via kiosk QR`,
      });

      return { reservation, parkingSession: created[0] };
    });

    return result;
  } finally {
    session.endSession();
  }
};

module.exports = { selfCheckInByQr, resolvePlateFromQr };
