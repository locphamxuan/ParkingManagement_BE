const AppError = require('../../../utils/AppError');
const { ParkingSession, ParkingSlot, LongTermSubscription, Reservation, Payment, User, Notification } = require('../../../models');
const { assignedBuildingIds, assertBuildingScope, logAudit } = require('../../../utils/staffScope');
const { normalizePlate, isValidVietnamPlate, plateMatchRegex } = require('../../../utils/plate.util');
const visionScanService = require('../visionScan.service');
const { asObjectId, calculateFee, calculateLongTermOverageFee, activeSubscriptionMatch } = require('./helpers');

const listActive = async (user, query = {}) => {
  const allowedBuildings = assertBuildingScope(user, query.buildingId || query.building);
  const buildingFilter = query.buildingId || query.building
    ? { building: query.buildingId || query.building }
    : { building: { $in: allowedBuildings } };

  const sessions = await ParkingSession.find({ ...buildingFilter, status: 'active' })
    // Loại ảnh base64 khỏi danh sách cho nhẹ payload — ảnh chỉ cần ở getById.
    .select('-plateImage -portraitImage -exitPlateImage -exitPortraitImage')
    .sort({ entryTime: -1 })
    .populate('entryGate', 'code name direction')
    .populate('exitGate', 'code name direction')
    .populate('vehicleType', 'name code')
    .populate('user', 'fullName email')
    .populate('staff', 'fullName email')
    .populate({ path: 'slot', select: 'code floor', populate: { path: 'floor', select: 'name code' } })
    .populate('reservation', 'estimatedFee fee endTime');

  // Attach the current fee (per manager's PricePolicy, fallback by kind) + member flag
  // so the staff UI can show the amount and who owns the vehicle.
  return Promise.all(
    sessions.map(async (s) => {
      const obj = s.toObject();
      obj.isLongTerm = s.paymentMethod === 'long_term';
      obj.isReservation = Boolean(s.reservation);
      // long_term session requires an account — treat as member even if user ref is null (data inconsistency)
      obj.isMember = Boolean(s.user) || obj.isLongTerm;
      if (obj.isLongTerm) {
        // Gói dài hạn: miễn phí trong hạn mức/ngày, chỉ tính phần vượt.
        const { fee, overageHours, maxHoursPerDay } = await calculateLongTermOverageFee(s);
        obj.currentFee = fee;
        obj.overageHours = overageHours;
        obj.maxHoursPerDay = maxHoursPerDay;
      } else if (obj.isReservation) {
        // Reservation: tiền còn lại = phí ước tính − tiền cọc đã trả.
        const estimated = s.reservation?.estimatedFee ?? 0;
        const deposit = s.reservation?.fee ?? 0;
        obj.reservationRemainingFee = Math.max(0, estimated - deposit);
        obj.currentFee = obj.reservationRemainingFee;
      } else {
        obj.currentFee = await calculateFee(s);
      }
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

  const [user, activeSession, activeSub, activeReservation] = await Promise.all([
    User.findOne({ 'licensePlates.plateNumber': plateRx })
      .select('fullName email phone walletBalance licensePlates'),
    ParkingSession.findOne({ plateNumber: plateRx, status: 'active' })
      .select('_id building entryTime'),
    // Gói dài hạn còn hiệu lực cho biển số này (để staff biết phải gán chỗ trống).
    // Dùng CHUNG định nghĩa với check-in (activeSubscriptionMatch): active + trong [startDate, endDate]
    // → badge "có gói" ở màn scan luôn khớp với hành vi check-in thật.
    LongTermSubscription.findOne({
      plateNumber: plateRx,
      ...activeSubscriptionMatch(),
      building: { $in: allowedBuildings },
    })
      .populate('package', 'name maxHoursPerDay')
      .sort('-updatedAt'),
    // Đặt chỗ còn hiệu lực cho biển số này (để FE biết là luồng "chỉ cần quét").
    Reservation.findOne({
      plateNumber: plateRx,
      status: { $in: ['pending', 'confirmed'] },
      building: { $in: allowedBuildings },
    })
      .select('_id code startTime endTime')
      .sort('-updatedAt'),
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
    // Gói floating: nếu có gói còn hạn, staff PHẢI gán 1 slot trống khi check-in.
    hasActivePackage: Boolean(activeSub),
    activePackage: activeSub
      ? {
          id: activeSub._id,
          name: activeSub.package?.name || 'Gói dài hạn',
          maxHoursPerDay: activeSub.package?.maxHoursPerDay ?? 0,
        }
      : null,
    // Đặt chỗ còn hiệu lực → luồng "chỉ cần quét", không bắt chụp ảnh.
    hasActiveReservation: Boolean(activeReservation),
    activeReservation: activeReservation
      ? { id: activeReservation._id, code: activeReservation.code }
      : null,
  };
};

/* ─────────────────────────────────────────────
   listFreeSlots — slot 'available' của 1 tòa nhà (cho staff gán xe gói lúc check-in)
───────────────────────────────────────────── */
const listFreeSlots = async (staffUser, buildingId) => {
  const allowed = assignedBuildingIds(staffUser).map(String);
  if (!buildingId) throw new AppError('building is required', 400);
  if (!allowed.includes(String(buildingId))) {
    throw new AppError('Forbidden building scope', 403, 'FORBIDDEN_BUILDING_SCOPE');
  }
  const slots = await ParkingSlot.find({ building: buildingId, status: 'available' })
    .select('_id code floor')
    .populate('floor', 'name code')
    .sort('code');
  return slots;
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
   getMyShiftRevenue — Doanh thu CA của nhân viên cổng ra.
   Tổng tiền nhân viên này đã thu (Payment type='session', success) TRONG NGÀY
   HÔM NAY, tách theo phương thức (tiền mặt / ví / QR-chuyển khoản) + danh sách lượt.
───────────────────────────────────────────── */
const getMyShiftRevenue = async (staffUser, query = {}) => {
  const allowedBuildings = assertBuildingScope(staffUser, query.building || query.buildingId);
  const buildingFilter = (query.building || query.buildingId)
    ? { building: query.building || query.buildingId }
    : { building: { $in: allowedBuildings } };

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const payments = await Payment.find({
    ...buildingFilter,
    staff: staffUser._id,
    type: 'session',
    status: 'success',
    createdAt: { $gte: start, $lte: end },
  })
    .populate('parkingSession', 'plateNumber')
    .sort('-createdAt')
    .lean();

  let total = 0;
  let cash = 0;
  let wallet = 0;
  let online = 0; // qr / payos / card
  const items = payments.map((p) => {
    const amount = p.amount || 0;
    total += amount;
    if (p.method === 'cash') cash += amount;
    else if (p.method === 'wallet') wallet += amount;
    else online += amount;
    return {
      _id: p._id,
      plateNumber: p.parkingSession?.plateNumber || null,
      amount,
      method: p.method,
      createdAt: p.createdAt,
    };
  });

  return {
    date: start,
    total,
    count: payments.length,
    byMethod: { cash, wallet, online },
    items,
  };
};

/* ─────────────────────────────────────────────
   listMyCheckIns — Lịch sử xe vào hôm nay của nhân viên cổng VÀO.
   Trả về các phiên check-in do nhân viên này thực hiện hôm nay, có location.
───────────────────────────────────────────── */
const listMyCheckIns = async (staffUser, query = {}) => {
  const allowedBuildings = assertBuildingScope(staffUser, query.building || query.buildingId);
  const buildingFilter = (query.building || query.buildingId)
    ? { building: query.building || query.buildingId }
    : { building: { $in: allowedBuildings } };

  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const sessions = await ParkingSession.find({
    ...buildingFilter,
    staff: staffUser._id,
    entryTime: { $gte: start },
  })
    .sort('-entryTime')
    .limit(100)
    .select('-plateImage -portraitImage -exitPlateImage -exitPortraitImage')
    .populate('entryGate', 'code name')
    .populate('vehicleType', 'name code')
    .populate({ path: 'slot', select: 'code floor', populate: { path: 'floor', select: 'name code' } })
    .lean();

  return sessions;
};

module.exports = { listActive, getById, search, lookupPlate, listFreeSlots, scanVehicle, rejectEntry, getMyShiftRevenue, listMyCheckIns };
