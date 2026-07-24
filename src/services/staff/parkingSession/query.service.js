const AppError = require('../../../utils/AppError');
const { ParkingSession, ParkingSlot, LongTermSubscription, User, Notification, PricePolicy } = require('../../../models');
const { assignedBuildingIds, assertBuildingScope, logAudit } = require('../../../utils/staffScope');
const { normalizePlate, isValidVietnamPlate, plateMatchRegex } = require('../../../utils/plate.util');
const visionScanService = require('../visionScan.service');
const { asObjectId, calculateFee, calculateLongTermOverageFee, activeSubscriptionMatch, resolveVehicleTypeId, acceptableUsageTypes } = require('./helpers');

// Lõi truy vấn dùng chung staff/manager — caller phải tự xác thực quyền building trước.
const listActiveByFilter = async (buildingFilter) => {
  const sessions = await ParkingSession.find({ ...buildingFilter, status: 'active' })
    // Loại ảnh base64 khỏi danh sách cho nhẹ payload — ảnh chỉ cần ở getById.
    .select('-plateImage -portraitImage -exitPlateImage -exitPortraitImage')
    .sort({ entryTime: -1 })
    .populate('entryGate', 'code name direction')
    .populate('exitGate', 'code name direction')
    .populate('vehicleType', 'name code')
    .populate('user', 'fullName email')
    .populate('staff', 'fullName email')
    .populate({ path: 'slot', select: 'code floor', populate: { path: 'floor', select: 'name code' } });

  // Preload PricePolicies cho tất cả (building, vehicleType) đang có session để tránh N+1.
  const bIds = [...new Set(sessions.map((s) => String(s.building)))];
  // String(null) = "null" là truthy → filter(Boolean) không đủ; phải filter "null" ra
  // để tránh Mongoose CastError khi session không có vehicleType.
  const vtIds = [...new Set(
    sessions
      .map((s) => (s.vehicleType ? String(s.vehicleType?._id || s.vehicleType) : null))
      .filter((id) => id && id !== 'null' && id !== 'undefined'),
  )];
  const rawPolicies = bIds.length
    ? await PricePolicy.find({
        building: { $in: bIds },
        ...(vtIds.length ? { vehicleType: { $in: vtIds } } : {}),
        isActive: true,
      }).lean()
    : [];
  // Map: `${buildingId}|${vehicleTypeId}` → PricePolicy[] để calculateFee tra cứu O(1).
  const policyMap = new Map();
  for (const p of rawPolicies) {
    const k = `${p.building}|${p.vehicleType}`;
    const arr = policyMap.get(k) || [];
    arr.push(p);
    policyMap.set(k, arr);
  }

  // Attach the current fee (per manager's PricePolicy, fallback by kind) + member flag
  // so the staff UI can show the amount and who owns the vehicle.
  return Promise.all(
    sessions.map(async (s) => {
      const obj = s.toObject();
      obj.isLongTerm = s.paymentMethod === 'long_term';
      // long_term session requires an account — treat as member even if user ref is null (data inconsistency)
      obj.isMember = Boolean(s.user) || obj.isLongTerm;
      if (obj.isLongTerm) {
        // Gói dài hạn: miễn phí trong hạn mức/ngày, chỉ tính phần vượt.
        const { fee, overageHours, maxHoursPerDay } = await calculateLongTermOverageFee(s);
        obj.currentFee = fee;
        obj.overageHours = overageHours;
        obj.maxHoursPerDay = maxHoursPerDay;
      } else {
        // Session thường: dùng policies đã preload, không query DB thêm.
        const vtId = s.vehicleType?._id || s.vehicleType || null;
        const sessionPolicies = policyMap.get(`${s.building}|${vtId}`) || [];
        obj.currentFee = await calculateFee(s, sessionPolicies);
      }
      return obj;
    })
  );
};

const listActive = async (user, query = {}) => {
  const allowedBuildings = assertBuildingScope(user, query.buildingId || query.building);
  const buildingFilter = query.buildingId || query.building
    ? { building: query.buildingId || query.building }
    : { building: { $in: allowedBuildings } };
  return listActiveByFilter(buildingFilter);
};

// Chi tiết session trong 1 building (kèm ảnh) — quyền building do caller xác thực (manager routes).
const getByIdInBuilding = async (buildingId, id) => {
  const parkingSession = await ParkingSession.findOne({ _id: id, building: buildingId })
    .populate('entryGate', 'code name direction')
    .populate('exitGate', 'code name direction')
    .populate('vehicleType', 'name code')
    .populate('user', 'fullName email')
    .populate('staff', 'fullName email')
    .populate({ path: 'slot', select: 'code floor', populate: { path: 'floor', select: 'name code' } });
  if (!parkingSession) {
    throw new AppError('Parking session not found', 404, 'SESSION_NOT_FOUND');
  }
  return parkingSession;
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

  const [user, activeSession, activeSub] = await Promise.all([
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
      .populate({ path: 'slot', select: 'code floor status', populate: { path: 'floor', select: 'name code' } })
      .sort('-updatedAt'),
  ]);

  // The vehicle type registered for THIS plate (normalized to car|motorcycle),
  // so the gate can verify the actual vehicle matches what was registered.
  let registeredVehicleType = null;
  if (user) {
    const matched = (user.licensePlates || []).find((p) => plateRx.test ? plateRx.test(p.plateNumber) : p.plateNumber === plate);
    const t = `${matched?.vehicleType || ''}`.toLowerCase();
    // Xe 2 bánh (kể cả điện) → motorcycle; còn lại (car/suv/truck/other) → car.
    if (['motorcycle', 'ebike', 'emotorbike'].includes(t)) registeredVehicleType = 'motorcycle';
    else if (t) registeredVehicleType = 'car';
  }

  // Đối tượng (usageType) suy ra từ trạng thái biển số — khớp resolveCustomerUsageType
  // ở check-in, để FE gọi /free-slots đúng pool slot.
  const usageType = activeSub
    ? 'subscriber'
    : user
      ? 'registered'
      : 'walk_in';

  return {
    plateNumber: plate,
    hasAccount: Boolean(user),
    usageType,
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
    // Nếu có gói còn hạn, staff gán slot trống khi check-in (hoặc dùng slot cố định của gói).
    hasActivePackage: Boolean(activeSub),
    activePackage: activeSub
      ? {
          id: activeSub._id,
          name: activeSub.package?.name || 'Gói dài hạn',
          maxHoursPerDay: activeSub.package?.maxHoursPerDay ?? 0,
          // Slot cố định của gói (nếu user đã chọn lúc mua) → staff hiển thị luôn.
          slot: activeSub.slot
            ? {
                id: activeSub.slot._id,
                code: activeSub.slot.code,
                status: activeSub.slot.status,
                floor: activeSub.slot.floor
                  ? { name: activeSub.slot.floor.name, code: activeSub.slot.floor.code }
                  : null,
              }
            : null,
        }
      : null,
  };
};

/* ─────────────────────────────────────────────
   listFreeSlots — slot 'available' của 1 tòa nhà (cho staff gán xe lúc check-in).
   Lọc CHẶT theo đối tượng (usageType, có fallback) để khách vãng lai không lấn slot
   hội viên. Loại xe (vehicleType từ camera) chỉ dùng để XẾP slot đúng loại lên đầu
   (gợi ý) — KHÔNG lọc bỏ — để staff vẫn chọn được dãy loại xe khác (vd loại xe tùy
   chỉnh của manager). 'suggestedSlotId' = slot best-fit để FE chọn sẵn.
───────────────────────────────────────────── */
const listFreeSlots = async (staffUser, buildingId, opts = {}) => {
  const allowed = assignedBuildingIds(staffUser).map(String);
  if (!buildingId) throw new AppError('building is required', 400);
  if (!allowed.includes(String(buildingId))) {
    throw new AppError('Forbidden building scope', 403, 'FORBIDDEN_BUILDING_SCOPE');
  }

  const filter = { building: buildingId, status: 'available' };
  // Đối tượng khớp theo chuỗi fallback (giống check-in) để FE hiện đúng pool slot.
  const chain = opts.usageType ? acceptableUsageTypes(opts.usageType) : [];
  if (chain.length) filter.usageType = { $in: chain };

  // Loại xe camera nhận diện → chỉ để XẾP HẠNG (không lọc).
  const detectedVtId = opts.vehicleType
    ? await resolveVehicleTypeId(buildingId, opts.vehicleType)
    : null;

  const slots = await ParkingSlot.find(filter)
    .select('_id code floor zone vehicleType usageType')
    .populate('floor', 'name code')
    .populate('zone', 'code usageType')
    .populate('vehicleType', 'name code');

  // Bối cảnh sức chứa (KHÔNG lọc theo đối tượng) để FE phân biệt 3 trạng thái khi
  // pool đúng đối tượng rỗng: (a) tòa không có slot cố định → đỗ theo sức chứa;
  // (b) tòa còn slot trống nhưng thuộc đối tượng khác → vãng lai KHÔNG được lấn;
  // (c) hết sạch slot trống → đầy. totalAvailable đếm slot 'available' toàn tòa.
  const [totalSlots, totalAvailable] = await Promise.all([
    ParkingSlot.countDocuments({ building: buildingId }),
    ParkingSlot.countDocuments({ building: buildingId, status: 'available' }),
  ]);

  // Xếp: đúng loại xe camera nhận diện trước → đúng đối tượng (best-fit) → theo code.
  const usageRank = (u) => {
    const i = chain.indexOf(u);
    return i === -1 ? chain.length : i;
  };
  const vtRank = (vt) =>
    detectedVtId && vt && String(vt._id || vt) === String(detectedVtId) ? 0 : 1;
  slots.sort(
    (a, b) =>
      vtRank(a.vehicleType) - vtRank(b.vehicleType) ||
      usageRank(a.usageType) - usageRank(b.usageType) ||
      String(a.code).localeCompare(String(b.code))
  );

  return {
    items: slots,
    suggestedSlotId: slots[0]?._id || null,
    totalSlots,
    totalAvailable,
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
  let account = {
    hasAccount: false,
    registeredVehicleType: null,
    user: null,
    activeSession: null,
    usageType: 'walk_in',
    hasActivePackage: false,
    activePackage: null,
  };
  if (isValidVietnamPlate(plateNumber)) {
    const lookup = await lookupPlate(staffUser, plateNumber);
    account = {
      hasAccount: lookup.hasAccount,
      registeredVehicleType: lookup.registeredVehicleType,
      user: lookup.user,
      activeSession: lookup.activeSession,
      usageType: lookup.usageType,
      hasActivePackage: lookup.hasActivePackage,
      activePackage: lookup.activePackage,
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
      title: isCheckout ? 'Check-out Rejected' : 'Check-in Rejected',
      message: `License plate ${plate} was rejected for ${isCheckout ? 'check-out' : 'check-in'}. Reason: ${`${reason}`.trim()}. Please check/update your vehicle details.`,
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

module.exports = { listActive, listActiveByFilter, getById, getByIdInBuilding, search, lookupPlate, listFreeSlots, scanVehicle, rejectEntry, listMyCheckIns };
