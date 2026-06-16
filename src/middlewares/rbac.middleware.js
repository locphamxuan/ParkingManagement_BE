const AppError = require("../utils/AppError");
const { ROLES } = require("../constants/roles");

const authorize =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user) {
      return next(new AppError("Authentication required", 401));
    }
    if (!roles.includes(req.user.role)) {
      return next(new AppError("Forbidden", 403));
    }
    next();
  };

// 🛠️ FIX TỬ HUYỆN: Kiểm tra an toàn sự tồn tại của req và req.body/query/params
const extractBuildingId = (req) => {
  if (!req) return null;
  return (
    req.params?.buildingId ||
    req.params?.id ||
    req.query?.buildingId ||
    req.query?.building ||
    req.body?.buildingId ||
    req.body?.building
  );
};

const authorizeBuildingAccess = (req, _res, next) => {
  if (!req.user) {
    return next(new AppError("Authentication required", 401));
  }

  // Nếu là ADMIN tối cao thì cho qua luôn, không cần check building
  if (req.user.role === 'admin' || req.user.role === ROLES.ADMIN) {
    return next();
  }

  const buildingId = extractBuildingId(req);
  
  // 🎯 THẮT CHẶT: Nếu không truyền buildingId, ném lỗi 400 rõ ràng chứ không để crash sập app
  if (!buildingId) {
    return next(new AppError("Validation Failed: buildingId is required in params/query/body to verify access scope.", 400));
  }

  const assignedBuildings = Array.isArray(req.user.assignedBuildings)
    ? req.user.assignedBuildings
    : [];
    
  const allowed = assignedBuildings.some(
    (building) => `${building._id || building}` === `${buildingId}`,
  );

  if (!allowed) {
    return next(new AppError("Forbidden: You do not have permission to manage this specific building.", 403));
  }

  next();
};

/**
 * Admin = operator chỉ-ĐỌC cấu hình tòa nhà: cho phép GET/HEAD/OPTIONS, chặn
 * mọi phương thức ghi (POST/PUT/PATCH/DELETE). Manager không bị ảnh hưởng.
 * Đặt SAU authorize(MANAGER, ADMIN) trên nhóm route quản lý tòa nhà.
 */
const READ_METHODS = ["GET", "HEAD", "OPTIONS"];
const readOnlyForAdmin = (req, _res, next) => {
  if (req.user?.role === ROLES.ADMIN && !READ_METHODS.includes(req.method)) {
    return next(
      new AppError(
        "Admin chỉ có quyền xem cấu hình tòa nhà (read-only).",
        403,
        "ADMIN_READ_ONLY",
      ),
    );
  }
  next();
};

module.exports = { authorize, authorizeBuildingAccess, readOnlyForAdmin };