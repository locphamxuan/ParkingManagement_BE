const ParkingSlot = require("../../models/building/ParkingSlot");
const ParkingSession = require("../../models/operations/ParkingSession");
const Payment = require("../../models/finance/Payment");
const Floor = require("../../models/building/Floor");
const Gate = require("../../models/building/Gate");
const LongTermSubscription = require("../../models/policy/LongTermSubscription");
const Feedback = require("../../models/log/Feedback");
const ShiftRevenue = require("../../models/finance/ShiftRevenue");
const { ensureManagerOwnsBuilding } = require("../../utils/managerScope");

const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const getOverview = async (user, buildingId) => {
  ensureManagerOwnsBuilding(user, buildingId);

  const today = startOfDay(new Date());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

  const [
    slots,
    floors,
    gates,
    activeSessions,
    todaySessions,
    revenueAgg,
    activeSubscriptions,
    openFeedbacks,
    weeklyRevenue,
  ] = await Promise.all([
    ParkingSlot.aggregate([
      { $match: { building: toObjectId(buildingId) } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    Floor.countDocuments({ building: buildingId }),
    Gate.countDocuments({ building: buildingId }),
    ParkingSession.countDocuments({
      building: buildingId,
      status: "active",
    }),
    ParkingSession.countDocuments({
      building: buildingId,
      entryTime: { $gte: today, $lt: tomorrow },
    }),
    Payment.aggregate([
      {
        $match: {
          building: toObjectId(buildingId),
          status: "success",
          createdAt: { $gte: today, $lt: tomorrow },
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
    LongTermSubscription.countDocuments({
      building: buildingId,
      status: "active",
    }),
    Feedback.countDocuments({
      building: buildingId,
      status: "pending",
    }),
    ShiftRevenue.aggregate([
      {
        $match: {
          building: toObjectId(buildingId),
          workDate: { $gte: sevenDaysAgo, $lt: tomorrow },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$workDate" },
          },
          totalRevenue: { $sum: "$totalRevenue" },
          sessionCount: { $sum: "$sessionCount" },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const slotByStatus = slots.reduce((acc, row) => {
    acc[row._id] = row.count;
    return acc;
  }, {});
  const totalSlots = slots.reduce((acc, row) => acc + row.count, 0);
  const occupied = slotByStatus.occupied || 0;
  const occupancyRate =
    totalSlots > 0 ? Math.round((occupied / totalSlots) * 1000) / 10 : 0;

  const revenueByMethod = revenueAgg.reduce((acc, row) => {
    acc[row._id] = { amount: row.amount, count: row.count };
    return acc;
  }, {});
  const todayRevenueTotal = revenueAgg.reduce(
    (acc, row) => acc + row.amount,
    0
  );

  return {
    slots: {
      total: totalSlots,
      ...slotByStatus,
      occupancyRate,
    },
    floors,
    gates,
    sessions: {
      active: activeSessions,
      today: todaySessions,
    },
    subscriptions: { active: activeSubscriptions },
    feedbacks: { pending: openFeedbacks },
    revenue: {
      today: todayRevenueTotal,
      byMethod: revenueByMethod,
      weekly: weeklyRevenue.map((d) => ({
        date: d._id,
        revenue: d.totalRevenue,
        sessions: d.sessionCount,
      })),
    },
  };
};

const mongoose = require("mongoose");
function toObjectId(id) {
  return new mongoose.Types.ObjectId(String(id));
}

module.exports = { getOverview };

