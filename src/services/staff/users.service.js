const mongoose = require('mongoose');
const AppError = require('../../utils/AppError');
const {
  ParkingSession,
  User,
} = require('../../models');
const { assignedBuildingIds } = require('../../utils/staffScope');

/**
 * lookupQr
 * Lookup user by ID (qrCode is actually userID).
 * Returns user info + active parking sessions.
 * Used by staff to identify parking customers.
 */
const lookupQr = async (staffUser, qrCode) => {
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

  // Get active parking sessions for this user
  const activeSessions = await ParkingSession.find({
    user: qrCode,
    status: 'active',
    building: { $in: allowedBuildings },
  }).select('_id building plateNumber entryTime fee');

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
    plate: plate ? { plateNumber: plate.plateNumber, vehicleType: plate.vehicleType } : null,
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

module.exports = { lookupQr, lookupPlateQr };
