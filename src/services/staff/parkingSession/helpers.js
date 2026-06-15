const mongoose = require('mongoose');
const AppError = require('../../../utils/AppError');
const {
  ParkingSession,
  ParkingSlot,
  Reservation,
  LongTermSubscription,
  VehicleType,
} = require('../../../models');
const { getMaxHoldMs } = require('../../../utils/reservationHold');
const { calculateParkingFee } = require('../../../utils/feeCalculator');
const { DEFAULT_HOURLY_RATE } = require('../../../constants/pricing');

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
    // Hết hạn → đánh dấu 'expired'; user trở thành tài khoản thường (tính giờ).
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
  const holdMs = await getMaxHoldMs(reservation.building);

  // Chặn check-in quá sớm: chỉ cho vào trong khoảng holdMs trước startTime.
  if (reservation.startTime) {
    const earliest = new Date(reservation.startTime).getTime() - holdMs;
    if (now < earliest) {
      throw new AppError('Chưa tới giờ check-in cho lượt đặt này', 409, 'RESERVATION_TOO_EARLY');
    }
  }

  const expiresAt = reservation.startTime ? new Date(reservation.startTime).getTime() + holdMs : null;
  const expired = expiresAt && expiresAt < now;

  if (expired) {
    reservation.status = 'expired';
    await reservation.save();
    // Nếu có giữ ô đỗ, hãy chuyển trạng thái ô đỗ về 'available'
    if (reservation.slot) {
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

/**
 * Compute the parking fee (VND) for a session — price by vehicle type via
 * PricePolicy, falling back to a flat hourly rate by kind. Mirrors checkOut.
 */
const calculateFee = async (parkingSession) => {
  if (parkingSession.fee && parkingSession.fee > 0) return parkingSession.fee;
  const now = new Date();
  const vtId = parkingSession.vehicleType?._id || parkingSession.vehicleType || null;
  let fee = await calculateParkingFee(parkingSession.building, vtId, parkingSession.entryTime, now);
  if (!fee || fee <= 0) {
    const kind = vehicleKindFromType(parkingSession.vehicleType);
    const hours = Math.max(1, Math.ceil((now.getTime() - new Date(parkingSession.entryTime).getTime()) / (1000 * 60 * 60)));
    fee = hours * (DEFAULT_HOURLY_RATE[kind] || DEFAULT_HOURLY_RATE.car);
  }
  return fee;
};

module.exports = {
  resolveVehicleTypeId,
  vehicleKindFromType,
  asObjectId,
  findDuplicateActiveSession,
  resolveLongTermSubscription,
  resolveReservation,
  findCapacityForBuilding,
  calculateFee,
};
