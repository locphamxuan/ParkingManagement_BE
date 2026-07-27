const PricePolicy = require("../../models/policy/PricePolicy");

// Admins have read-only visibility into building price policies; managers own pricing.
const list = async (query = {}) => {
  const filter = {};
  if (query.buildingId) filter.building = query.buildingId;
  if (query.isActive !== undefined)
    filter.isActive = query.isActive === "true" || query.isActive === true;

  return PricePolicy.find(filter)
    .populate("building", "name code")
    .populate("vehicleType", "code name")
    .sort("-effectiveFrom");
};

module.exports = { list };
