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
const { calculateParkingFee } = require('../../../utils/feeEngine');
const { computeDailyOverageHours } = require('../../../utils/longTermUsage');
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

// Trùng biển CHỈ xét trong CÙNG tòa nhà — phiên active ở tòa khác không chặn check-in
// ở tòa này (mỗi tòa vận hành độc lập; vẫn có forceCheckIn để bỏ qua nếu cần).
const findDuplicateActiveSession = async (plateNumber, buildingId) => {
  const filter = { plateNumber, status: 'active' };
  if (buildingId) filter.building = buildingId;
  return ParkingSession.findOne(filter);
};

/**
 * ĐỊNH NGHĨA DUY NHẤT của "gói dài hạn đang hiệu lực" — dùng chung cho cả check-in
 * (resolveLongTermSubscription) lẫn màn tra cứu biển số (lookupPlate / lookupQr) để các
 * nơi KHÔNG bao giờ lệch nhau: phải đang 'active' VÀ ĐANG trong khoảng hiệu lực
 * [startDate, endDate].
 *
 * - endDate >= now      : chưa hết hạn.
 * - startDate <= cuối ngày hôm nay : đã tới hạn dùng. So với CUỐI NGÀY (thay vì `now`)
 *   để gói "bắt đầu trong hôm nay" vẫn được nhận dù lệch múi giờ (đúng lo ngại cũ),
 *   NHƯNG gói có startDate từ NGÀY MAI trở đi (mua trước, chưa tới kỳ) sẽ KHÔNG bị
 *   tính là "đang có gói" — tránh báo nhầm "có gói" khi gói chưa hiệu lực.
 *
 * `now` truyền vào để mọi nơi so cùng một mốc thời gian.
 */
const activeSubscriptionMatch = (now = new Date()) => {
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  return {
    status: 'active',
    startDate: { $lte: endOfToday },
    endDate: { $gte: now },
  };
};

const resolveLongTermSubscription = async (plateNumber, allowedBuildings) => {
  const now = new Date();
  const subscription = await LongTermSubscription.findOne({
    plateNumber,
    ...activeSubscriptionMatch(now),
    building: { $in: allowedBuildings },
  }).sort({ updatedAt: -1 });

  if (!subscription) {
    // Self-heal: nếu có gói 'active' nhưng đã quá endDate (job chưa chạy) → đánh dấu
    // 'expired' để dữ liệu nhất quán cho lần sau. Không ảnh hưởng kết quả lần này.
    await LongTermSubscription.updateMany(
      { plateNumber, status: 'active', endDate: { $lt: now }, building: { $in: allowedBuildings } },
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
    // Đánh dấu expired + thả slot + hoàn % cọc theo chính sách — dùng CHUNG một
    // đường code với job/staff để không lệch nghiệp vụ hoàn tiền.
    const { expireReservationWithRefund } = require('../../reservationLifecycle.service');
    await expireReservationWithRefund(reservation._id);
    return null;
  }

  if (reservation.slot && reservation.slot.status === 'maintenance') {
    throw new AppError('Assigned slot is under maintenance', 409, 'SLOT_MAINTENANCE_NOT_AVAILABLE');
  }

  return reservation;
};

/**
 * Suy ra "đối tượng sử dụng" (usageType) của một lượt check-in để khớp với dãy/slot:
 *  - subscriber : có gói dài hạn đang hiệu lực
 *  - reserved   : có lượt đặt chỗ hợp lệ
 *  - registered : biển số gắn với 1 tài khoản đã đăng ký
 *  - walk_in    : còn lại (khách vãng lai)
 * Thứ tự ưu tiên: subscriber > reserved > registered > walk_in.
 */
const resolveCustomerUsageType = ({ longTerm, reservation, registeredOwner }) => {
  if (longTerm) return 'subscriber';
  if (reservation) return 'reserved';
  if (registeredOwner) return 'registered';
  return 'walk_in';
};

/**
 * Chuỗi ưu tiên đối tượng cho slot (fallback MỘT CHIỀU): hội viên/đặt chỗ có thể
 * dùng tạm slot "chung" (walk_in) khi hết slot đúng đối tượng, NHƯNG khách vãng lai
 * KHÔNG bao giờ chiếm slot dành cho hội viên/gói/đặt chỗ. Index nhỏ hơn = ưu tiên hơn.
 */
const USAGE_FALLBACK_CHAIN = {
  walk_in: ['walk_in'],
  registered: ['registered', 'walk_in'],
  subscriber: ['subscriber', 'registered', 'walk_in'],
  reserved: ['reserved', 'registered', 'walk_in'],
};

const acceptableUsageTypes = (usageType) =>
  USAGE_FALLBACK_CHAIN[usageType] || (usageType ? [usageType] : []);

/**
 * Tìm các slot TRỐNG tương thích với (loại xe + đối tượng) của lượt check-in.
 * Loại xe khớp chặt; đối tượng khớp theo chuỗi fallback ở trên. Sắp xếp để slot
 * ĐÚNG đối tượng đứng trước (gợi ý best-fit), rồi tới các slot fallback.
 */
const findCompatibleSlots = async (buildingId, vehicleTypeId, usageType, session = null) => {
  const filter = { building: buildingId, status: 'available' };
  // Slot có vehicleType/usageType = null là slot "vạn năng" (không gắn zone) —
  // nhận mọi loại xe/đối tượng, nhất quán với isSlotUsageCompatible khi chọn tay.
  if (vehicleTypeId) filter.vehicleType = { $in: [vehicleTypeId, null] };
  const chain = acceptableUsageTypes(usageType);
  if (chain.length) filter.usageType = { $in: [...chain, null] };
  const q = ParkingSlot.find(filter);
  if (session) q.session(session);
  const slots = await q;
  const rank = (u) => {
    const i = chain.indexOf(u);
    return i === -1 ? chain.length : i;
  };
  // Thứ tự gợi ý: đúng đối tượng trước (slot vạn năng xếp cuối) → đúng loại xe
  // trước slot vạn năng → ưu tiên slot không dành cho đặt trước (reservable=false)
  // để giữ slot reservable cho user tự đặt.
  return slots.sort(
    (a, b) =>
      rank(a.usageType) - rank(b.usageType) ||
      (a.vehicleType ? 0 : 1) - (b.vehicleType ? 0 : 1) ||
      (a.reservable ? 1 : 0) - (b.reservable ? 1 : 0) ||
      String(a.code).localeCompare(String(b.code))
  );
};

const findCapacityForBuilding = async (buildingId) => {
  const totalSlots = await ParkingSlot.countDocuments({ building: buildingId, status: { $ne: 'maintenance' } });
  const activeSessions = await ParkingSession.countDocuments({ building: buildingId, status: 'active' });
  return { totalSlots, activeSessions };
};

/**
 * Phí "vượt giờ" hiện tại của một session GÓI DÀI HẠN (long_term):
 * miễn phí trong maxHoursPerDay/ngày, chỉ tính phần vượt theo PricePolicy.
 * Mirror đúng logic checkOut để staff thấy số tiền sẽ thu trùng khớp.
 */
const calculateLongTermOverageFee = async (parkingSession, now = new Date()) => {
  let maxHoursPerDay = 0;
  const m = /long_term:([a-f\d]{24})/i.exec(parkingSession.note || '');
  if (m) {
    const sub = await LongTermSubscription.findById(m[1]).populate('package', 'maxHoursPerDay');
    maxHoursPerDay = Number(sub?.package?.maxHoursPerDay || 0);
  }

  const overageHours = await computeDailyOverageHours({
    plateNumber: parkingSession.plateNumber,
    building: parkingSession.building,
    entryTime: parkingSession.entryTime,
    exitTime: now,
    excludeSessionId: parkingSession._id,
    maxHoursPerDay,
  });
  if (overageHours <= 0) return { fee: 0, overageHours: 0, maxHoursPerDay };

  const vtId = parkingSession.vehicleType?._id || parkingSession.vehicleType || null;
  const overageStart = new Date(now.getTime() - overageHours * 60 * 60 * 1000);
  let fee = await calculateParkingFee(parkingSession.building, vtId, overageStart, now);
  if (!fee || fee <= 0) {
    const kind = vehicleKindFromType(parkingSession.vehicleType);
    fee = Math.ceil(overageHours) * (DEFAULT_HOURLY_RATE[kind] || DEFAULT_HOURLY_RATE.car);
  }
  return { fee, overageHours, maxHoursPerDay };
};

/**
 * Compute the parking fee (VND) for a session — price by vehicle type via
 * PricePolicy, falling back to a flat hourly rate by kind. Mirrors checkOut.
 * Gói dài hạn (long_term): miễn phí trong hạn mức/ngày, chỉ tính phần vượt.
 */
const calculateFee = async (parkingSession, preloadedPolicies) => {
  if (parkingSession.fee && parkingSession.fee > 0) return parkingSession.fee;
  const now = new Date();
  if (parkingSession.paymentMethod === 'long_term') {
    const { fee } = await calculateLongTermOverageFee(parkingSession, now);
    return fee;
  }
  const vtId = parkingSession.vehicleType?._id || parkingSession.vehicleType || null;
  let fee = await calculateParkingFee(parkingSession.building, vtId, parkingSession.entryTime, now, preloadedPolicies);
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
  activeSubscriptionMatch,
  resolveLongTermSubscription,
  resolveReservation,
  resolveCustomerUsageType,
  acceptableUsageTypes,
  findCompatibleSlots,
  findCapacityForBuilding,
  calculateFee,
  calculateLongTermOverageFee,
};
