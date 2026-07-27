const mongoose = require('mongoose');
const AppError = require('../../utils/AppError');
const {
  ParkingSession,
  User,
  LongTermSubscription,
} = require('../../models');
const { assertBuildingScope } = require('../../utils/staffScope');
const { activeSubscriptionMatch } = require('./parkingSession/helpers');

/**
 * Ràng buộc CHUNG cho mọi tra cứu QR của staff: phải chỉ đích danh MỘT tòa nhà
 * và staff phải được phân công đúng tòa đó. Không có fallback "tất cả tòa được
 * phân quyền" — nếu không thì staff tòa A quét QR vẫn thấy dữ liệu tòa B.
 */
const assertQrBuildingScope = (staffUser, buildingId) => {
  if (!buildingId) throw new AppError('building is required', 400, 'BUILDING_REQUIRED');
  assertBuildingScope(staffUser, buildingId);
};

// Chỉ những trường cổng thực sự cần để nhận diện phiên gửi xe. KHÔNG kèm phí/PII.
const toSessionSummary = (session) => ({
  id: session._id,
  plateNumber: session.plateNumber,
  entryTime: session.entryTime,
});

/**
 * lookupQr
 * Lookup user by ID (qrCode is actually userID), scoped to the selected building.
 * Returns the customer's display name plus the active sessions/packages OF THAT
 * BUILDING ONLY. Never returns email, phone, wallet balance or the plate list.
 */
const lookupQr = async (staffUser, qrCode, buildingId) => {
  if (!qrCode) throw new AppError('qrCode (userID) is required', 400);
  assertQrBuildingScope(staffUser, buildingId);

  // Validate if qrCode is a valid ObjectId
  if (!mongoose.Types.ObjectId.isValid(qrCode)) {
    throw new AppError('Invalid user ID format', 400);
  }

  // Find user by ID — chỉ lấy tên hiển thị cho nghiệp vụ cổng.
  const user = await User.findById(qrCode).select('fullName isActive');

  if (!user) {
    return {
      userId: qrCode,
      hasAccount: false,
      user: null,
      activeSessions: [],
      activePackages: [],
    };
  }

  // Active parking sessions + active packages, lọc ĐÚNG tòa nhà đang chọn.
  const [activeSessions, activePackages] = await Promise.all([
    ParkingSession.find({
      user: qrCode,
      status: 'active',
      building: buildingId,
    }).select('_id plateNumber entryTime'),
    LongTermSubscription.find({
      user: qrCode,
      ...activeSubscriptionMatch(),
      building: buildingId,
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
      isActive: user.isActive,
    },
    activeSessions: activeSessions.map(toSessionSummary),
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
 * Lookup a license plate by its unique QR token (PLT-...), scoped to the selected
 * building. Returns only the scanned plate itself and that owner's active sessions
 * in the selected building — no owner identity, contact info or other plates.
 */
const lookupPlateQr = async (staffUser, qrCode, buildingId) => {
  if (!qrCode) throw new AppError('qrCode is required', 400);
  assertQrBuildingScope(staffUser, buildingId);

  const owner = await User.findOne({ 'licensePlates.qrCode': qrCode }).select('licensePlates');

  if (!owner) {
    return { qrCode, found: false, plate: null, activeSessions: [] };
  }

  const plate = owner.licensePlates.find((p) => p.qrCode === qrCode);

  const activeSessions = await ParkingSession.find({
    user: owner._id,
    status: 'active',
    building: buildingId,
  }).select('_id plateNumber entryTime');

  return {
    qrCode,
    found: true,
    // Chỉ biển số VỪA QUÉT — không trả toàn bộ licensePlates của chủ xe.
    plate: plate
      ? { plateNumber: plate.plateNumber, vehicleType: plate.vehicleType, brand: plate.brand || null }
      : null,
    activeSessions: activeSessions.map(toSessionSummary),
  };
};

/**
 * resolveQr
 * Unified entry point for the staff "Camera 2" QR scanner. Dispatches by token
 * shape so the frontend doesn't have to guess which lookup to call:
 *   - 'PLT-...'        → license-plate QR  (lookupPlateQr)
 *   - valid ObjectId   → account/user QR   (lookupQr)
 * Returns the underlying result tagged with `kind` ('plate' | 'user').
 * `buildingId` là BẮT BUỘC và được áp cho CẢ HAI nhánh.
 */
const resolveQr = async (staffUser, code, buildingId) => {
  const value = `${code || ''}`.trim();
  if (!value) throw new AppError('qrCode is required', 400);
  assertQrBuildingScope(staffUser, buildingId);

  if (value.toUpperCase().startsWith('PLT-')) {
    const data = await lookupPlateQr(staffUser, value, buildingId);
    return { kind: 'plate', ...data };
  }

  if (mongoose.Types.ObjectId.isValid(value)) {
    const data = await lookupQr(staffUser, value, buildingId);
    return { kind: 'user', ...data };
  }

  throw new AppError('Mã QR không hợp lệ (cần mã biển số PLT- hoặc ID tài khoản).', 400, 'INVALID_QR_CODE');
};

module.exports = { lookupQr, lookupPlateQr, resolveQr };
