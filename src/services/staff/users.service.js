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

module.exports = { lookupQr };
