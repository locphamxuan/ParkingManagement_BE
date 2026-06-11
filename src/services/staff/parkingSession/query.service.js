const AppError = require('../../../utils/AppError');
const { ParkingSession, User, Notification } = require('../../../models');
const { assignedBuildingIds, assertBuildingScope, logAudit } = require('../../../utils/staffScope');
const { normalizePlate, isValidVietnamPlate, plateMatchRegex } = require('../../../utils/plate.util');
const visionScanService = require('../visionScan.service');
const { asObjectId, calculateFee } = require('./helpers');

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
    .populate({ path: 'slot', select: 'code floor', populate: { path: 'floor', select: 'name code' } });

  // Attach the current fee (per manager's PricePolicy, fallback by kind) + member flag
  // so the staff UI can show the amount and who owns the vehicle.
  return Promise.all(
    sessions.map(async (s) => {
      const obj = s.toObject();
      obj.currentFee = await calculateFee(s);
      obj.isMember = Boolean(s.user);
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

  const [user, activeSession] = await Promise.all([
    User.findOne({ 'licensePlates.plateNumber': plateRx })
      .select('fullName email phone walletBalance licensePlates'),
    ParkingSession.findOne({ plateNumber: plateRx, status: 'active' })
      .select('_id building entryTime'),
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

module.exports = { listActive, getById, search, lookupPlate, scanVehicle, rejectEntry };
