const mongoose = require('mongoose');
const AppError = require('../../../utils/AppError');
const {
  ParkingSession,
  ParkingSlot,
  LongTermSubscription,
  VehicleType,
} = require('../../../models');
const { calculateParkingFee } = require('../../../utils/feeEngine');
const { computeDailyOverageHours } = require('../../../utils/longTermUsage');
const { expireStaleSubscriptions } = require('../../shared/slotLifecycle.service');
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

/**
 * Nhóm loại xe của một VehicleType chỉ có reference (slot/dãy lưu ObjectId).
 * null = không gắn loại xe (slot "vạn năng") → hợp với mọi loại.
 */
const loadVehicleKind = async (vehicleTypeId, session = null) => {
  if (!vehicleTypeId) return null;
  const vt = await VehicleType.findById(vehicleTypeId).session(session);
  return vt ? vehicleKindFromType(vt) : null;
};

/**
 * Loại xe CHÍNH THỨC của một lượt vào bãi theo gói dài hạn: luôn là loại xe của
 * GÓI (`subscription.package.vehicleType`, đã populate). Loại xe camera nhận diện
 * hoặc staff/client gửi lên chỉ là dữ liệu hỗ trợ — không được ghi đè ràng buộc
 * của gói (gói xe máy không được cấp ô ô tô và ngược lại).
 */
const packageVehicleOf = (subscription) => {
  const vt = subscription?.package?.vehicleType || null;
  const isPopulated = Boolean(vt?.code || vt?.name);
  return {
    id: vt?._id || vt || null,
    kind: isPopulated ? vehicleKindFromType(vt) : null,
  };
};

/** Ràng buộc loại xe của gói — dùng chung cho check-in staff và kiosk. */
const assertPackageVehicleKind = (packageKind, candidateKind, message) => {
  if (packageKind && candidateKind && packageKind !== candidateKind) {
    throw new AppError(message, 409, 'PACKAGE_VEHICLE_TYPE_MISMATCH');
  }
};

const asObjectId = (value) =>
  mongoose.Types.ObjectId.isValid(value) ? value : null;

// Trùng biển CHỈ xét trong CÙNG tòa nhà — phiên active ở tòa khác không chặn check-in
// ở tòa này (mỗi tòa vận hành độc lập). Bất biến này được chốt ở tầng DB bằng unique
// partial index `uniq_active_session_per_plate_building`; hàm này chỉ để báo lỗi đẹp
// TRƯỚC khi ghi, KHÔNG phải cơ chế bảo vệ duy nhất.
const findDuplicateActiveSession = async (plateNumber, buildingId, mongoSession = null) => {
  const filter = { plateNumber, status: 'active' };
  if (buildingId) filter.building = buildingId;
  const query = ParkingSession.findOne(filter);
  if (mongoSession) query.session(mongoSession);
  return query;
};

/**
 * Lỗi 11000 của unique index phiên-active → lỗi nghiệp vụ ổn định, dùng CHUNG cho
 * staff check-in và kiosk để hai đường vào bãi không lệch thông điệp/mã lỗi.
 */
const isDuplicateActiveSessionError = (error) => {
  if (error?.code !== 11000) return false;
  if (`${error?.message || ''}`.includes('uniq_active_session_per_plate_building')) return true;

  const keys = Object.keys(error?.keyPattern || {}).sort();
  return keys.length === 2 && keys[0] === 'building' && keys[1] === 'plateNumber';
};

const duplicateActiveSessionError = () => new AppError(
  'This plate already has an active parking session in this building. Check the vehicle out before checking it in again.',
  409,
  'DUPLICATE_ACTIVE_SESSION',
);

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

/** Populate loại xe của gói — nguồn sự thật cho ràng buộc slot lúc vào bãi. */
const POPULATE_PACKAGE_VEHICLE_TYPE = {
  path: 'package',
  select: 'vehicleType maxHoursPerDay',
  populate: { path: 'vehicleType', select: 'code name' },
};

const resolveLongTermSubscription = async (plateNumber, allowedBuildings, mongoSession = null) => {
  const now = new Date();
  const query = LongTermSubscription.findOne({
    plateNumber,
    ...activeSubscriptionMatch(now),
    building: { $in: allowedBuildings },
  })
    .populate('user', 'isActive')
    .populate('slot')
    .populate(POPULATE_PACKAGE_VEHICLE_TYPE)
    .sort({ updatedAt: -1 });
  if (mongoSession) query.session(mongoSession);
  const subscription = await query;

  if (!subscription) {
    await expireStaleSubscriptions(
      { plateNumber, buildingIds: allowedBuildings, now },
      mongoSession,
    );
    return null;
  }

  // A long-term entitlement must always have a live owner account. This is
  // normally guaranteed by the account-deletion guard, but checking again at
  // the gate prevents legacy/corrupt records from granting a free entry.
  if (!subscription.user || subscription.user.isActive === false) {
    return null;
  }

  return subscription;
};

/**
 * Suy ra "đối tượng sử dụng" (usageType) của một lượt check-in để khớp với dãy/slot:
 *  - subscriber : có gói dài hạn đang hiệu lực
 *  - registered : biển số gắn với 1 tài khoản đã đăng ký
 *  - walk_in    : còn lại (khách vãng lai)
 * Thứ tự ưu tiên: subscriber > registered > walk_in.
 */
const resolveCustomerUsageType = ({ longTerm, registeredOwner }) => {
  if (longTerm) return 'subscriber';
  if (registeredOwner) return 'registered';
  return 'walk_in';
};

/**
 * Chuỗi ưu tiên đối tượng cho slot (fallback MỘT CHIỀU): hội viên có thể dùng tạm
 * slot "chung" (walk_in) khi hết slot đúng đối tượng, NHƯNG khách vãng lai KHÔNG bao
 * giờ chiếm slot dành cho hội viên/gói. Index nhỏ hơn = ưu tiên hơn.
 */
const USAGE_FALLBACK_CHAIN = {
  walk_in: ['walk_in'],
  registered: ['registered', 'walk_in'],
  subscriber: ['subscriber', 'registered', 'walk_in'],
};

const acceptableUsageTypes = (usageType) =>
  USAGE_FALLBACK_CHAIN[usageType] || (usageType ? [usageType] : []);

/**
 * Filter slot trống tương thích — DÙNG CHUNG cho auto-selection lúc check-in và
 * danh sách staff chọn tay, để hai đường không trôi lệch về chuỗi fallback hay
 * cách đối xử với slot "vạn năng" (usageType/vehicleType = null).
 *
 * `restrictVehicleType` là khác biệt CHỦ ĐÍCH giữa hai đường:
 *  - auto-selection: true  → chỉ gán slot đúng loại xe (hoặc slot vạn năng);
 *  - danh sách chọn tay: false → loại xe chỉ dùng để XẾP HẠNG, staff vẫn thấy và
 *    chọn được slot loại xe khác (manager có thể cấu hình loại xe riêng).
 */
const slotCompatibilityFilter = (
  buildingId,
  { usageType, vehicleTypeId = null, restrictVehicleType = false } = {},
) => {
  const filter = { building: buildingId, status: 'available' };
  const chain = acceptableUsageTypes(usageType);
  if (chain.length) filter.usageType = { $in: [...chain, null] };
  if (restrictVehicleType && vehicleTypeId) {
    filter.vehicleType = { $in: [vehicleTypeId, null] };
  }
  return filter;
};

/** Rank đối tượng theo chuỗi fallback; ngoài chuỗi (gồm slot vạn năng null) xếp cuối. */
const usageRanker = (usageType) => {
  const chain = acceptableUsageTypes(usageType);
  return (slotUsageType) => {
    const index = chain.indexOf(slotUsageType);
    return index === -1 ? chain.length : index;
  };
};

/**
 * Tìm các slot TRỐNG tương thích với (loại xe + đối tượng) của lượt check-in.
 * Loại xe khớp chặt; đối tượng khớp theo chuỗi fallback ở trên. Sắp xếp để slot
 * ĐÚNG đối tượng đứng trước (gợi ý best-fit), rồi tới các slot fallback.
 */
const findCompatibleSlots = async (buildingId, vehicleTypeId, usageType, session = null, zoneId = null) => {
  const filter = slotCompatibilityFilter(buildingId, {
    usageType,
    vehicleTypeId,
    restrictVehicleType: true,
  });
  if (zoneId) filter.zone = zoneId;
  const q = ParkingSlot.find(filter);
  if (session) q.session(session);
  const slots = await q;
  const rank = usageRanker(usageType);
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
  loadVehicleKind,
  packageVehicleOf,
  assertPackageVehicleKind,
  POPULATE_PACKAGE_VEHICLE_TYPE,
  asObjectId,
  findDuplicateActiveSession,
  isDuplicateActiveSessionError,
  duplicateActiveSessionError,
  activeSubscriptionMatch,
  resolveLongTermSubscription,
  resolveCustomerUsageType,
  acceptableUsageTypes,
  slotCompatibilityFilter,
  usageRanker,
  findCompatibleSlots,
  findCapacityForBuilding,
  calculateFee,
  calculateLongTermOverageFee,
};
