const Reservation = require('../../models/operations/Reservation');
const Building = require('../../models/building/Building');
const VehicleType = require('../../models/building/VehicleType');
const ReservationPolicy = require('../../models/policy/ReservationPolicy');
const AppError = require('../../utils/AppError');
const generateBookingCode = require('../../utils/generateBookingCode');

const CANCELLABLE_STATUSES = ['pending', 'confirmed'];

const list = async (userId, query = {}) => {
  const filter = { user: userId };
  if (query.status) filter.status = query.status;

  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);

  const [items, total] = await Promise.all([
    Reservation.find(filter)
      .sort('-startTime')
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('building', 'name address')
      .populate('vehicleType', 'name'),
    Reservation.countDocuments(filter),
  ]);

  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

const get = async (userId, id) => {
  const reservation = await Reservation.findOne({ _id: id, user: userId })
    .populate('building', 'name address')
    .populate('vehicleType', 'name');
  if (!reservation) throw new AppError('Reservation not found', 404);
  return reservation;
};

const create = async (userId, { buildingId, vehicleTypeId, plateNumber, startTime, endTime }) => {
  const buildingExists = await Building.exists({ _id: buildingId });
  if (!buildingExists) throw new AppError('Building not found', 404);

  const vehicleTypeExists = await VehicleType.exists({ _id: vehicleTypeId, building: buildingId, isActive: true });
  if (!vehicleTypeExists) throw new AppError('Vehicle type not found for this building', 404);

  const policy = await ReservationPolicy.findOne({ building: buildingId, isActive: true });
  if (!policy) throw new AppError('Tòa nhà chưa cấu hình chính sách đặt chỗ', 400);

  const now = new Date();
  const start = new Date(startTime);
  const end = new Date(endTime);

  const minAdvanceMs = policy.minAdvanceMinutes * 60 * 1000;
  const maxAdvanceMs = policy.maxAdvanceHours * 60 * 60 * 1000;

  if (start - now < minAdvanceMs) {
    throw new AppError(
      `Phải đặt chỗ trước ít nhất ${policy.minAdvanceMinutes} phút`,
      400
    );
  }
  if (start - now > maxAdvanceMs) {
    throw new AppError(
      `Chỉ được đặt chỗ tối đa ${policy.maxAdvanceHours} giờ trước`,
      400
    );
  }

  const code = generateBookingCode('RSV');
  const created = await Reservation.create({
    code,
    user: userId,
    building: buildingId,
    vehicleType: vehicleTypeId,
    plateNumber: String(plateNumber).trim().toUpperCase(),
    startTime: start,
    endTime: end,
    status: 'pending',
    slot: null,
  });

  const reservation = await Reservation.findById(created._id)
    .populate('building', 'name address')
    .populate('vehicleType', 'name');

  return reservation;
};

const cancel = async (userId, id) => {
  const reservation = await Reservation.findOne({ _id: id, user: userId });
  if (!reservation) throw new AppError('Reservation not found', 404);

  if (!CANCELLABLE_STATUSES.includes(reservation.status)) {
    throw new AppError('Không thể hủy đặt chỗ ở trạng thái này', 400);
  }

  reservation.status = 'cancelled';
  await reservation.save();
  return reservation;
};

module.exports = { list, get, create, cancel };
