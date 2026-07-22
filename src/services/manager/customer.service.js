const User = require("../../models/user/User");
const ParkingSession = require("../../models/operations/ParkingSession");
const LongTermSubscription = require("../../models/policy/LongTermSubscription");
const { ensureManagerOwnsBuilding } = require("../../utils/managerScope");

/**
 * "Khách hàng" của building = user có account (role: 'user') đã từng dùng bãi này:
 *  - có ít nhất 1 ParkingSession{ building, user != null }, HOẶC
 *  - có ít nhất 1 LongTermSubscription{ building }
 * (walk-in — ParkingSession.user === null — không tính vì không có account để "đăng ký gói").
 * Mỗi user trả kèm hasActivePackage (có sub status:'active') và hasAnyPackage (có sub bất kỳ
 * trạng thái nào) để manager phân biệt "chưa từng đăng ký" với "đã từng nhưng hết hạn/hủy".
 */
const listCustomers = async (user, buildingId, query = {}) => {
  ensureManagerOwnsBuilding(user, buildingId);
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);

  const [sessionUserIds, subs] = await Promise.all([
    ParkingSession.distinct("user", { building: buildingId, user: { $ne: null } }),
    LongTermSubscription.find({ building: buildingId }).select("user status").lean(),
  ]);

  const candidateIds = new Set(sessionUserIds.map(String));
  subs.forEach((s) => candidateIds.add(String(s.user)));

  if (candidateIds.size === 0) {
    return { items: [], pagination: { page, limit, total: 0, totalPages: 0 } };
  }

  // userId -> { hasActivePackage, hasAnyPackage }
  const packageStatusByUser = new Map();
  subs.forEach((s) => {
    const uid = String(s.user);
    const entry = packageStatusByUser.get(uid) || {
      hasActivePackage: false,
      hasAnyPackage: false,
    };
    entry.hasAnyPackage = true;
    if (s.status === "active") entry.hasActivePackage = true;
    packageStatusByUser.set(uid, entry);
  });

  const users = await User.find({
    _id: { $in: Array.from(candidateIds) },
    role: "user",
  })
    .select("fullName email phone")
    .sort("fullName")
    .lean();

  let items = users.map((u) => {
    const status = packageStatusByUser.get(String(u._id)) || {
      hasActivePackage: false,
      hasAnyPackage: false,
    };
    return {
      _id: u._id,
      fullName: u.fullName,
      email: u.email,
      phone: u.phone || null,
      hasActivePackage: status.hasActivePackage,
      hasAnyPackage: status.hasAnyPackage,
    };
  });

  if (query.hasPackage === "true") {
    items = items.filter((c) => c.hasAnyPackage);
  } else if (query.hasPackage === "false") {
    items = items.filter((c) => !c.hasAnyPackage);
  }

  const total = items.length;
  const start = (page - 1) * limit;
  const paged = items.slice(start, start + limit);

  return {
    items: paged,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

module.exports = { listCustomers };
