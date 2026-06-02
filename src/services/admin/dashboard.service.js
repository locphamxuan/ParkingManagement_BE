const Building = require("../../models/building/Building");
const User = require("../../models/user/User");
const ParkingSession = require("../../models/operations/ParkingSession");
const Payment = require("../../models/finance/Payment");
const { ROLES } = require("../../constants/roles");

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

  const [
    totalBuildings,
    totalManagers,
    totalStaff,
    totalUsers,
    activeSessions,
    periodPayments,
  ] = await Promise.all([
    Building.countDocuments({}),
    User.countDocuments({ role: ROLES.MANAGER, isActive: true }),
    User.countDocuments({ role: ROLES.STAFF, isActive: true }),
    User.countDocuments({ role: ROLES.USER }),
    ParkingSession.countDocuments({ status: "active" }),
    Payment.aggregate([
      {
        $match: {
          status: "success",
          createdAt: { $gte: from, $lte: to },
        },
      },
      {
        $group: {
          _id: "$method",
          amount: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const revenueByMethod = periodPayments.reduce((acc, row) => {
    acc[row._id] = { amount: row.amount, count: row.count };
    return acc;
  }, {});
  const totalRevenue = periodPayments.reduce((acc, row) => acc + row.amount, 0);

  return {
    period,
    counts: {
      buildings: totalBuildings,
      managers: totalManagers,
      staff: totalStaff,
      users: totalUsers,
      activeSessions,
    },
    revenue: { total: totalRevenue, byMethod: revenueByMethod },
  };
};

module.exports = { getOverview };
