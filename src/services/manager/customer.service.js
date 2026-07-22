const mongoose = require("mongoose");
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

  const [sessionAgg, subs] = await Promise.all([
    ParkingSession.aggregate([
      { $match: { building: new mongoose.Types.ObjectId(String(buildingId)), user: { $ne: null } } },
      { $group: { _id: "$user", sessionCount: { $sum: 1 }, lastVisitAt: { $max: "$entryTime" } } },
    ]),
    LongTermSubscription.find({ building: buildingId })
      .select("user status plateNumber startDate endDate package refundPercent refundAmount")
      .populate("package", "name price")
      .sort("-startDate")
      .lean(),
  ]);

  // userId -> { sessionCount, lastVisitAt } — thống kê lượt gửi xe TẠI TOÀ này.
  const visitStatsByUser = new Map(sessionAgg.map((s) => [String(s._id), s]));

  const candidateIds = new Set(sessionAgg.map((s) => String(s._id)));
  subs.forEach((s) => candidateIds.add(String(s.user)));

  if (candidateIds.size === 0) {
    return { items: [], pagination: { page, limit, total: 0, totalPages: 0 } };
  }

  // userId -> { hasActivePackage, hasAnyPackage, subscriptions: [...] } — gộp luôn chi
  // tiết từng lượt đăng ký gói (Subscribers cũ) vào đúng dòng user tương ứng, để manager
  // xem/hủy gói ngay tại đây thay vì phải qua tab khác.
  const packageStatusByUser = new Map();
  subs.forEach((s) => {
    const uid = String(s.user);
    const entry = packageStatusByUser.get(uid) || {
      hasActivePackage: false,
      hasAnyPackage: false,
      subscriptions: [],
    };
    entry.hasAnyPackage = true;
    if (s.status === "active") entry.hasActivePackage = true;
    entry.subscriptions.push({
      _id: s._id,
      plateNumber: s.plateNumber,
      startDate: s.startDate,
      endDate: s.endDate,
      status: s.status,
      package: s.package ? { _id: s.package._id, name: s.package.name, price: s.package.price } : null,
      refundPercent: s.refundPercent,
      refundAmount: s.refundAmount,
    });
    packageStatusByUser.set(uid, entry);
  });

  const users = await User.find({
    _id: { $in: Array.from(candidateIds) },
    role: "user",
  })
    .select("fullName email phone licensePlates isActive walletBalance createdAt")
    .sort("fullName")
    .lean();

  let items = users.map((u) => {
    const status = packageStatusByUser.get(String(u._id)) || {
      hasActivePackage: false,
      hasAnyPackage: false,
      subscriptions: [],
    };
    const visitStats = visitStatsByUser.get(String(u._id)) || { sessionCount: 0, lastVisitAt: null };
    return {
      _id: u._id,
      fullName: u.fullName,
      email: u.email,
      phone: u.phone || null,
      isActive: u.isActive,
      walletBalance: u.walletBalance || 0,
      createdAt: u.createdAt,
      licensePlates: (u.licensePlates || []).map((p) => ({
        plateNumber: p.plateNumber,
        vehicleType: p.vehicleType,
      })),
      sessionCount: visitStats.sessionCount,
      lastVisitAt: visitStats.lastVisitAt,
      hasActivePackage: status.hasActivePackage,
      hasAnyPackage: status.hasAnyPackage,
      subscriptions: status.subscriptions,
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
