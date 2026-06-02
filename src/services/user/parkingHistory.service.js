const ParkingSession = require('../../models/operations/ParkingSession');

const list = async (userId, query = {}) => {
  const filter = { user: userId };
  if (query.buildingId) filter.building = query.buildingId;

  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);

  const [items, total] = await Promise.all([
    ParkingSession.find(filter)
      .sort('-entryTime')
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('building', 'name address')
      .populate('vehicleType', 'name'),
    ParkingSession.countDocuments(filter),
  ]);

  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

module.exports = { list };
