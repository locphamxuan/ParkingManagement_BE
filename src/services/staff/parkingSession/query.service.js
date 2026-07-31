const AppError = require('../../../utils/AppError');
const { ParkingSession, ParkingSlot, LongTermSubscription, Vehicle, Notification, PricePolicy } = require('../../../models');
const { plateCoreOf } = require('../../../models/vehicle/Vehicle');
const { assignedBuildingIds, assertBuildingScope, logAudit } = require('../../../utils/staffScope');
const { normalizePlate, isValidVietnamPlate, plateMatchRegex } = require('../../../utils/plate.util');
const { kindOfCategory, labelOfCategory } = require('../../../constants/vehicle');
const visionScanService = require('../visionScan.service');
const { assertStaffHasActiveShift } = require('../../shared/entryAuthorization.service');
const { asObjectId, calculateRegularSessionFee, calculateLongTermOverageFee, activeSubscriptionMatch, resolveVehicleTypeId, slotCompatibilityFilter, usageRanker } = require('./helpers');

// Lõi truy vấn dùng chung staff/manager — caller phải tự xác thực quyền building trước.
const listActiveByFilter = async (buildingFilter) => {
  const sessions = await ParkingSession.find({ ...buildingFilter, status: 'active' })
    // Loại ảnh base64 khỏi danh sách cho nhẹ payload — ảnh chỉ cần ở getById.
    .select('-plateImage -portraitImage -exitPlateImage -exitPortraitImage')
    .sort({ entryTime: -1 })
    .populate('entryGate', 'code name direction')
    .populate('exitGate', 'code name direction')
    .populate('vehicleType', 'name code category')
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
  // Map: `${buildingId}|${vehicleTypeId}` → PricePolicy[] để tính phí O(1).
  const policyMap = new Map();
  for (const p of rawPolicies) {
    const k = `${p.building}|${p.vehicleType}`;
    const arr = policyMap.get(k) || [];
    arr.push(p);
    policyMap.set(k, arr);
  }

  // Attach the current fee from the manager-configured PricePolicy + member flag.
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
        // Session thường: dùng policies đã preload, không query DB thêm. A
        // missing policy is surfaced to the UI; it must never look like free
        // parking or fall back to a hidden flat rate.
        const vtId = s.vehicleType?._id || s.vehicleType || null;
        const sessionPolicies = policyMap.get(`${s.building}|${vtId}`) || [];
        const quote = await calculateRegularSessionFee(s, sessionPolicies);
        obj.currentFee = quote.hasPolicy ? quote.fee : null;
        obj.pricePolicyConfigured = quote.hasPolicy;
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
    .populate('vehicleType', 'name code category')
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
    .populate('vehicleType', 'name code category');
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
    .sort({ entryTime: -1, _id: -1 })
    .populate('entryGate', 'code name')
    .populate('vehicleType', 'name code category');
};

/* ─────────────────────────────────────────────
   lookupPlate
   Identifies whether a plate belongs to a registered user.
   Used by staff at entry gate to decide payment options.
───────────────────────────────────────────── */

const lookupPlate = async (staffUser, plateNumber, buildingId) => {
  const plate = normalizePlate(plateNumber);
  if (!plate) throw new AppError('plateNumber is required', 400);
  if (!buildingId) throw new AppError('building is required', 400, 'BUILDING_REQUIRED');

  assertBuildingScope(staffUser, buildingId);

  // Separator-insensitive match so a plate stored in any equivalent format
  // (e.g. 59G2-03880 / 59G2-038.80) still resolves to its owner.
  const plateRx = plateMatchRegex(plate) || plate;

  // Chủ xe được tra qua chính chiếc xe (unique theo lõi biển số) thay vì quét mảng
  // biển nhúng trong User — một truy vấn có index, không còn regex trên toàn bảng.
  const vehicle = await Vehicle.findOne({ plateCore: plateCoreOf(plate) })
    .select('owner category brand')
    .populate('owner', 'fullName');
  const user = vehicle?.owner || null;
  const [activeSession, activeSub] = await Promise.all([
    ParkingSession.findOne({ plateNumber: plateRx, status: 'active', building: buildingId })
      .select('_id building entryTime'),
    // Gói dài hạn còn hiệu lực cho biển số này (để staff biết phải gán chỗ trống).
    // Dùng CHUNG định nghĩa với check-in (activeSubscriptionMatch): active + trong [startDate, endDate]
    // → badge "có gói" ở màn scan luôn khớp với hành vi check-in thật.
    user
      ? LongTermSubscription.findOne({
          plateNumber: plateRx,
          user: user._id,
          ...activeSubscriptionMatch(),
          building: buildingId,
        })
        .populate('package', 'name maxHoursPerDay')
        .populate({ path: 'slot', select: 'code floor status', populate: { path: 'floor', select: 'name code' } })
        .sort('-updatedAt')
      : Promise.resolve(null),
  ]);

  // Thể loại xe đã đăng ký cho ĐÚNG biển này, để cổng đối chiếu xe thật với hồ sơ.
  // `registeredVehicleKind` là nhóm 2 bánh/4 bánh dùng cho khớp ô đỗ và bảng giá;
  // `registeredVehicle` là mô tả đầy đủ để nhân viên nhìn mắt thường mà xác nhận.
  const registeredVehicle = vehicle
    ? {
        category: vehicle.category,
        categoryLabel: labelOfCategory(vehicle.category),
        brand: vehicle.brand || null,
      }
    : null;
  const registeredVehicleKind = vehicle ? kindOfCategory(vehicle.category) : null;

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
    registeredVehicleKind,
    registeredVehicle,
    user: user
      ? {
          id: user._id,
          fullName: user.fullName,
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

  // Cùng filter đối tượng với auto-selection lúc check-in (chuỗi fallback + slot
  // vạn năng), khác duy nhất ở chỗ KHÔNG lọc theo loại xe — xem
  // `slotCompatibilityFilter` để biết vì sao khác biệt này là chủ đích.
  const filter = slotCompatibilityFilter(buildingId, {
    usageType: opts.usageType,
    restrictVehicleType: false,
  });

  // Loại xe camera nhận diện → chỉ để XẾP HẠNG (không lọc).
  const detectedVtId = opts.vehicleType
    ? await resolveVehicleTypeId(buildingId, opts.vehicleType)
    : null;

  const slots = await ParkingSlot.find(filter)
    .select('_id code floor zone vehicleType usageType')
    .populate('floor', 'name code')
    .populate('zone', 'code usageType')
    .populate('vehicleType', 'name code category');

  // Bối cảnh sức chứa (KHÔNG lọc theo đối tượng) để FE phân biệt 3 trạng thái khi
  // pool đúng đối tượng rỗng: (a) tòa không có slot cố định → đỗ theo sức chứa;
  // (b) tòa còn slot trống nhưng thuộc đối tượng khác → vãng lai KHÔNG được lấn;
  // (c) hết sạch slot trống → đầy. totalAvailable đếm slot 'available' toàn tòa.
  const [totalSlots, totalAvailable] = await Promise.all([
    ParkingSlot.countDocuments({ building: buildingId }),
    ParkingSlot.countDocuments({ building: buildingId, status: 'available' }),
  ]);

  // Xếp: đúng loại xe camera nhận diện trước → đúng đối tượng (best-fit) → theo code.
  const usageRank = usageRanker(opts.usageType);
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

const scanVehicle = async (staffUser, image, buildingId) => {
  if (!buildingId) throw new AppError('building is required', 400, 'BUILDING_REQUIRED');
  assertBuildingScope(staffUser, buildingId);

  // Plate recognition is an assistive step, never a reason to block gate
  // operations.  A staff member can still enter a plate manually or use the
  // QR scanner when the configured OCR provider is unavailable.  Invalid
  // camera payloads remain hard 4xx errors; only a provider outage degrades
  // gracefully.
  let scanStatus = 'available';
  let vision = {
    plateNumber: '',
    plateConfidence: 0,
    vehicleType: null,
    brand: null,
    brandConfidence: 0,
  };
  try {
    vision = await visionScanService.scanVehicleImage(image);
  } catch (err) {
    if (!['AI_SCAN_FAILED', 'AI_SCAN_NOT_CONFIGURED'].includes(err?.errorCode)) throw err;
    scanStatus = 'unavailable';
    // Keep the operational cause in server logs for monitoring, while the
    // client receives a successful manual-entry fallback instead of a 502.
    console.error('[staff-scan] OCR provider unavailable; using manual-entry fallback:', err.message);
  }

  const { plateNumber, plateConfidence, vehicleType, brand, brandConfidence } = vision;

  // Resolve the owner account only when we have a valid plate.
  let account = {
    hasAccount: false,
    registeredVehicleKind: null,
    registeredVehicle: null,
    user: null,
    activeSession: null,
    usageType: 'walk_in',
    hasActivePackage: false,
    activePackage: null,
  };
  if (isValidVietnamPlate(plateNumber)) {
    const lookup = await lookupPlate(staffUser, plateNumber, buildingId);
    account = {
      hasAccount: lookup.hasAccount,
      registeredVehicleKind: lookup.registeredVehicleKind,
      registeredVehicle: lookup.registeredVehicle,
      user: lookup.user,
      activeSession: lookup.activeSession,
      usageType: lookup.usageType,
      hasActivePackage: lookup.hasActivePackage,
      activePackage: lookup.activePackage,
    };
  }

  // Camera chỉ phân biệt được 2 bánh / 4 bánh, nên đối chiếu ở mức NHÓM chứ không
  // ở mức thể loại chi tiết — tránh báo lệch giả khi khách khai 'suv' mà máy đọc 'car'.
  const vehicleTypeMismatch = Boolean(
    account.registeredVehicleKind && vehicleType && account.registeredVehicleKind !== vehicleType
  );

  return {
    scanStatus,
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
  if (!building) throw new AppError('building is required', 400, 'BUILDING_REQUIRED');
  assertBuildingScope(staffUser, building);
  const activeStaffShift = await assertStaffHasActiveShift(staffUser._id, building);

  const isCheckout = stage === 'check-out';
  if (isCheckout) {
    const activeSession = await ParkingSession.exists({
      plateNumber: plateMatchRegex(plate) || plate,
      status: 'active',
      building,
    });
    if (!activeSession) {
      throw new AppError(
        'No active parking session exists for this plate in the selected building',
        409,
        'ACTIVE_SESSION_NOT_FOUND',
      );
    }
  }
  const rejectedVehicle = await Vehicle.findOne({ plateCore: plateCoreOf(plate) }).select('owner');

  let notified = false;
  if (rejectedVehicle) {
    await Notification.create({
      user: rejectedVehicle.owner,
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
    metadata: {
      plateNumber: plate,
      reason: `${reason}`.trim(),
      notified,
      staffShiftId: `${activeStaffShift._id}`,
      assignedGateId: activeStaffShift.gate?._id
        ? `${activeStaffShift.gate._id}`
        : activeStaffShift.gate
          ? `${activeStaffShift.gate}`
          : null,
    },
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
    .populate('vehicleType', 'name code category')
    .populate({ path: 'slot', select: 'code floor', populate: { path: 'floor', select: 'name code' } })
    .lean();

  return sessions;
};

/* ─────────────────────────────────────────────
   listMyCheckouts — Lịch sử xe RA (completed) hôm nay của nhân viên cổng RA.
───────────────────────────────────────────── */
const listMyCheckouts = async (staffUser, query = {}) => {
  const allowedBuildings = assertBuildingScope(staffUser, query.building || query.buildingId);
  const buildingFilter = (query.building || query.buildingId)
    ? { building: query.building || query.buildingId }
    : { building: { $in: allowedBuildings } };

  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const sessions = await ParkingSession.find({
    ...buildingFilter,
    status: 'completed',
    exitTime: { $gte: start },
  })
    .sort('-exitTime')
    .limit(100)
    .select('-plateImage -portraitImage -exitPlateImage -exitPortraitImage')
    .populate('entryGate', 'code name')
    .populate('exitGate', 'code name')
    .populate('vehicleType', 'name code category')
    .populate('user', 'fullName email')
    .populate({ path: 'slot', select: 'code floor', populate: { path: 'floor', select: 'name code' } })
    .lean();

  return sessions;
};

/* ─────────────────────────────────────────────
   listHistory — Lịch sử tất cả xe vào/ra dành cho Manager (phân trang + lọc).
───────────────────────────────────────────── */
const listHistory = async (buildingId, query = {}) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);

  const filter = { building: buildingId };
  if (query.status) filter.status = query.status;
  if (query.plate) filter.plateNumber = plateMatchRegex(query.plate);
  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = new Date(query.from);
    if (query.to) filter.createdAt.$lte = new Date(query.to);
  }

  const [items, total] = await Promise.all([
    ParkingSession.find(filter)
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(limit)
      .select('-plateImage -portraitImage -exitPlateImage -exitPortraitImage')
      .populate('entryGate', 'code name')
      .populate('exitGate', 'code name')
      .populate('vehicleType', 'name code category')
      .populate('user', 'fullName email')
      .populate('staff', 'fullName email')
      .populate({ path: 'slot', select: 'code floor', populate: { path: 'floor', select: 'name code' } })
      .lean(),
    ParkingSession.countDocuments(filter),
  ]);

  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

module.exports = { listActive, listActiveByFilter, getById, getByIdInBuilding, search, lookupPlate, listFreeSlots, scanVehicle, rejectEntry, listMyCheckIns, listMyCheckouts, listHistory };

