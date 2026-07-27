const Building = require("../../models/building/Building");
const User = require("../../models/user/User");
const ParkingSession = require("../../models/operations/ParkingSession");
const ParkingSlot = require("../../models/building/ParkingSlot");
const Payment = require("../../models/finance/Payment");
const { ROLES } = require("../../constants/roles");
const { localUtcOffset } = require("../../utils/dateBucket");
const { REVENUE_PAYMENT_TYPES } = require("../../constants/finance");

const getDateRange = (period) => {
  const now = new Date();
  const from = new Date(now);

  if (period === "week") {
    const day = from.getDay();
    const diff = day === 0 ? -6 : 1 - day; // Monday
    from.setDate(from.getDate() + diff);
  } else if (period === "month") {
    from.setDate(1);
  }
  from.setHours(0, 0, 0, 0);

  return { from, to: now };
};

const getOverview = async (period = "today") => {
  const { from, to } = getDateRange(period);

  // Cửa sổ 7 ngày cho biểu đồ xu hướng doanh thu.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

  const [
    totalBuildings,
    totalManagers,
    totalStaff,
    totalUsers,
    activeSessions,
    periodPayments,
    weeklyAgg,
    slotsByBuilding,
    revenueByBuildingToday,
  ] = await Promise.all([
    Building.countDocuments({}),
    User.countDocuments({ role: ROLES.MANAGER, isActive: true }),
    User.countDocuments({ role: ROLES.STAFF, isActive: true }),
    User.countDocuments({ role: ROLES.USER }),
    ParkingSession.countDocuments({ status: "active" }),
    Payment.aggregate([
      // Chỉ doanh thu thật (session/reservation/subscription) — loại 'refund'/'topup'.
      // 'cancellation_fee' KHÔNG được cộng thêm: tiền cọc gốc đã tính vào revenue qua
      // type 'reservation' lúc đặt chỗ; cancellation_fee chỉ là bản ghi audit của phần
      // giữ lại trong cọc đó, cộng thêm sẽ đếm trùng (double-count).
      { $set: { effectiveAt: { $ifNull: ["$settledAt", "$createdAt"] } } },
      { $match: { status: "success", type: { $in: [...REVENUE_PAYMENT_TYPES, "refund"] }, effectiveAt: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: "$method",
          amount: { $sum: { $cond: [{ $in: ["$type", REVENUE_PAYMENT_TYPES] }, "$amount", 0] } },
          refunds: { $sum: { $cond: [{ $eq: ["$type", "refund"] }, "$amount", 0] } },
          count: { $sum: { $cond: [{ $in: ["$type", REVENUE_PAYMENT_TYPES] }, 1, 0] } },
        },
      },
    ]),
    // Xu hướng doanh thu 7 ngày (toàn hệ thống) — thay cho việc gọi dashboard từng tòa nhà.
    Payment.aggregate([
      { $set: { effectiveAt: { $ifNull: ["$settledAt", "$createdAt"] } } },
      { $match: { status: "success", type: { $in: [...REVENUE_PAYMENT_TYPES, "refund"] }, effectiveAt: { $gte: sevenDaysAgo, $lt: tomorrow } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$effectiveAt", timezone: localUtcOffset() } },
          revenue: { $sum: { $cond: [{ $in: ["$type", REVENUE_PAYMENT_TYPES] }, "$amount", 0] } },
          refunds: { $sum: { $cond: [{ $eq: ["$type", "refund"] }, "$amount", 0] } },
          sessions: { $sum: { $cond: [{ $in: ["$type", REVENUE_PAYMENT_TYPES] }, 1, 0] } },
        },
      },
      { $set: { netRevenue: { $subtract: ["$revenue", "$refunds"] } } },
      { $sort: { _id: 1 } },
    ]),
    // Tỷ lệ lấp đầy theo từng tòa nhà — 1 aggregation thay cho N call.
    ParkingSlot.aggregate([
      {
        $group: {
          _id: "$building",
          total: { $sum: 1 },
          occupied: { $sum: { $cond: [{ $eq: ["$status", "occupied"] }, 1, 0] } },
        },
      },
    ]),
    // Doanh thu hôm nay theo từng tòa nhà — 1 aggregation.
    Payment.aggregate([
      { $set: { effectiveAt: { $ifNull: ["$settledAt", "$createdAt"] } } },
      { $match: { status: "success", type: { $in: REVENUE_PAYMENT_TYPES }, building: { $ne: null }, effectiveAt: { $gte: today, $lt: tomorrow } } },
      { $group: { _id: "$building", amount: { $sum: "$amount" } } },
    ]),
  ]);

  const revenueByMethod = periodPayments.reduce((acc, row) => {
    acc[row._id] = {
      amount: row.amount,
      refunds: row.refunds,
      net: row.amount - row.refunds,
      count: row.count,
    };
    return acc;
  }, {});
  const totalRevenue = periodPayments.reduce((acc, row) => acc + row.amount, 0);
  const totalRefunds = periodPayments.reduce((acc, row) => acc + row.refunds, 0);

  const weekly = weeklyAgg.map((d) => ({ date: d._id, revenue: d.revenue, sessions: d.sessions }));

  const revenueTodayMap = new Map(revenueByBuildingToday.map((r) => [String(r._id), r.amount]));
  const buildingStats = slotsByBuilding.map((s) => ({
    buildingId: String(s._id),
    occupancyRate: s.total > 0 ? Math.round((s.occupied / s.total) * 1000) / 10 : 0,
    revenueToday: revenueTodayMap.get(String(s._id)) || 0,
  }));

  return {
    period,
    counts: {
      buildings: totalBuildings,
      managers: totalManagers,
      staff: totalStaff,
      users: totalUsers,
      activeSessions,
    },
    revenue: {
      total: totalRevenue,
      gross: totalRevenue,
      refunds: totalRefunds,
      net: totalRevenue - totalRefunds,
      byMethod: revenueByMethod,
      weekly,
      definitions: {
        gross: "Successful earned payments before refunds",
        net: "Gross revenue minus refunds",
      },
    },
    buildingStats,
  };
};

module.exports = { getOverview };
