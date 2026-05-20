const Building = require("../../models/building/Building");
const User = require("../../models/user/User");
const ParkingSession = require("../../models/operations/ParkingSession");
const Payment = require("../../models/finance/Payment");
const { ROLES } = require("../../constants/roles");

const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const getOverview = async () => {
  const today = startOfDay(new Date());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [
    totalBuildings,
    totalManagers,
    totalStaff,
    totalUsers,
    activeSessions,
    todayPayments,
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
          createdAt: { $gte: today, $lt: tomorrow },
        },
      },
      { $group: { _id: "$method", amount: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),
  ]);

  const revenueByMethod = todayPayments.reduce((acc, row) => {
    acc[row._id] = { amount: row.amount, count: row.count };
    return acc;
  }, {});
  const todayRevenue = todayPayments.reduce((acc, row) => acc + row.amount, 0);

  return {
    counts: {
      buildings: totalBuildings,
      managers: totalManagers,
      staff: totalStaff,
      users: totalUsers,
      activeSessions,
    },
    revenue: { today: todayRevenue, byMethod: revenueByMethod },
  };
};

module.exports = { getOverview };

