const AuditLog = require("../../models/log/AuditLog");

const list = async (query = {}) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 30, 1), 200);

  const filter = {};
  if (query.action) filter.action = String(query.action).toUpperCase();
  if (query.severity) filter.severity = query.severity;
  if (query.building) filter.building = query.building;
  if (query.targetTable) filter.targetTable = query.targetTable;

  const [items, total] = await Promise.all([
    AuditLog.find(filter)
      .populate("actor", "fullName email role")
      .populate("building", "name code")
      .sort("-createdAt")
      .skip((page - 1) * limit)
      .limit(limit),
    AuditLog.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

module.exports = { list };

