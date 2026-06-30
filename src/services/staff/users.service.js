const mongoose = require('mongoose');
const AppError = require('../../utils/AppError');
const {
  ParkingSession,
  User,
  LongTermSubscription,
} = require('../../models');
const { assignedBuildingIds } = require('../../utils/staffScope');
const { activeSubscriptionMatch } = require('./parkingSession/helpers');

/**
 * lookupQr
 * Lookup user by ID (qrCode is actually userID).
 * Returns user info + active parking sessions.
 * Used by staff to identify parking customers.
 */
const lookupQr = async (staffUser, qrCode, buildingId = null) => {
  if (!qrCode) throw new AppError('qrCode (userID) is required', 400);

  // Validate if qrCode is a valid ObjectId
  if (!mongoose.Types.ObjectId.isValid(qrCode)) {
    throw new AppError('Invalid user ID format', 400);
  }

  // Must be scoped to at least one building
  const allowedBuildings = assignedBuildingIds(staffUser);
  if (!allowedBuildings.length) {
    throw new AppError('No assigned buildings for this staff user', 403, 'FORBIDDEN_BUILDING_SCOPE');
  }

  // Lọc theo tòa nhà hiện tại nếu truyền vào, ngược lại lấy tất cả tòa nhà được phân quyền.
  const buildingFilter = buildingId ? buildingId : { $in: allowedBuildings };

  // Find user by ID
  const user = await User.findById(qrCode).select(
    'fullName email phone walletBalance licensePlates isActive'
  );

  if (!user) {
    return {
      userId: qrCode,
      hasAccount: false,
      user: null,
      activeSessions: [],
    };
  }

  // Get active parking sessions + active packages for this user
  const [activeSessions, activePackages] = await Promise.all([
    ParkingSession.find({
      user: qrCode,
      status: 'active',
      building: buildingFilter,
    }).select('_id building plateNumber entryTime fee'),
    LongTermSubscription.find({
      user: qrCode,
      ...activeSubscriptionMatch(),
      building: buildingFilter,
    })
      .populate('package', 'name code')
      .select('_id plateNumber startDate endDate'),
  ]);

  return {
    userId: qrCode,
    hasAccount: true,
    user: {
      id: user._id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone || null,
      walletBalance: user.walletBalance,
      licensePlates: user.licensePlates || [],
      isActive: user.isActive,
    },
    activeSessions: activeSessions.map((session) => ({
      id: session._id,
      building: session.building,
      plateNumber: session.plateNumber,
      entryTime: session.entryTime,
      fee: session.fee,
    })),
    activePackages: activePackages.map((sub) => ({
      id: sub._id,
      name: sub.package?.name || 'Gói dài hạn',
      code: sub.package?.code || null,
      plateNumber: sub.plateNumber,
      startDate: sub.startDate,
      endDate: sub.endDate,
    })),
  };
};

/**
 * lookupPlateQr
 * Lookup a license plate by its unique QR token (PLT-...). Returns the matched
 * plate, its owner, and that owner's active parking sessions. Used by staff to
 * identify a vehicle by scanning the plate's QR code.
 */
const lookupPlateQr = async (staffUser, qrCode) => {
  if (!qrCode) throw new AppError('qrCode is required', 400);

  const allowedBuildings = assignedBuildingIds(staffUser);
  if (!allowedBuildings.length) {
    throw new AppError('No assigned buildings for this staff user', 403, 'FORBIDDEN_BUILDING_SCOPE');
  }

  const owner = await User.findOne({ 'licensePlates.qrCode': qrCode }).select(
    'fullName email phone walletBalance licensePlates isActive'
  );

  if (!owner) {
    return { qrCode, found: false, plate: null, user: null, activeSessions: [] };
  }

  const plate = owner.licensePlates.find((p) => p.qrCode === qrCode);

  const activeSessions = await ParkingSession.find({
    user: owner._id,
    status: 'active',
    building: { $in: allowedBuildings },
  }).select('_id building plateNumber entryTime fee');

  return {
    qrCode,
    found: true,
    plate: plate ? { plateNumber: plate.plateNumber, vehicleType: plate.vehicleType, brand: plate.brand || null } : null,
    user: {
      id: owner._id,
      fullName: owner.fullName,
      email: owner.email,
      phone: owner.phone || null,
      walletBalance: owner.walletBalance,
      isActive: owner.isActive,
    },
    activeSessions: activeSessions.map((session) => ({
      id: session._id,
      building: session.building,
      plateNumber: session.plateNumber,
      entryTime: session.entryTime,
      fee: session.fee,
    })),
  };
};

/**
 * resolveQr
 * Unified entry point for the staff "Camera 2" QR scanner. Dispatches by token
 * shape so the frontend doesn't have to guess which lookup to call:
 *   - 'PLT-...'        → license-plate QR  (lookupPlateQr)
 *   - valid ObjectId   → account/user QR   (lookupQr)
 * Returns the underlying result tagged with `kind` ('plate' | 'user').
 */
const resolveQr = async (staffUser, code, buildingId = null) => {
  const value = `${code || ''}`.trim();
  if (!value) throw new AppError('qrCode is required', 400);

  if (value.toUpperCase().startsWith('PLT-')) {
    const data = await lookupPlateQr(staffUser, value);
    return { kind: 'plate', ...data };
  }

  if (mongoose.Types.ObjectId.isValid(value)) {
    const data = await lookupQr(staffUser, value, buildingId);
    return { kind: 'user', ...data };
  }

  throw new AppError('Mã QR không hợp lệ (cần mã biển số PLT- hoặc ID tài khoản).', 400, 'INVALID_QR_CODE');
};

module.exports = { lookupQr, lookupPlateQr, resolveQr };
