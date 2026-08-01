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
      // `previousValue`/`newValue`/`metadata` là ảnh chụp nguyên bản ghi (một
      // ParkingSession kèm ảnh base64 có thể tới hàng trăm KB). Danh sách chỉ dùng
      // để tra cứu nên bỏ hẳn ba trường này ra khỏi payload — chúng từng làm một
      // trang 200 dòng nặng vài MB và mất hàng chục giây trên mạng chậm.
      .select("-previousValue -newValue -metadata")
      .populate("actor", "fullName email role")
      .populate("building", "name code")
      .sort("-createdAt")
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    AuditLog.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

module.exports = { list };

