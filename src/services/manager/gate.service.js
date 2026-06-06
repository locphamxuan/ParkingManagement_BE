const Gate = require("../../models/building/Gate");
const AppError = require("../../utils/AppError");
const { ensureManagerOwnsBuilding } = require("../../utils/managerScope");
const { writeAuditLog } = require("../../utils/audit");

const GATE_STATUS = ["active", "inactive", "maintenance"];

// Mỗi tòa nhà có 2 cổng cố định: Cổng vào (in) + Cổng ra (out).
// Manager không CRUD cổng — chỉ xem. Hệ thống tự sinh & duy trì.
const DEFAULT_GATES = [
  { code: "IN", name: "Cổng vào", direction: "in" },
  { code: "OUT", name: "Cổng ra", direction: "out" },
];

/**
 * Đảm bảo tòa nhà có sẵn cổng vào + cổng ra (idempotent).
 * Tạo cổng còn thiếu theo từng `direction`, an toàn khi gọi đồng thời.
 */
const ensureDefaultGates = async (buildingId) => {
  await Promise.all(
    DEFAULT_GATES.map(async (g) => {
      const exists = await Gate.findOne({ building: buildingId, direction: g.direction });
      if (exists) return;
      try {
        await Gate.create({
          building: buildingId,
          code: g.code,
          name: g.name,
          direction: g.direction,
          allowedVehicleTypes: [],
          status: "active",
        });
      } catch (err) {
        // Bỏ qua lỗi trùng key (đã được tạo bởi request song song khác).
        if (err && err.code !== 11000) throw err;
      }
    })
  );
};

const list = async (user, buildingId) => {
  ensureManagerOwnsBuilding(user, buildingId);
  await ensureDefaultGates(buildingId);
  return Gate.find({ building: buildingId })
    .populate("allowedVehicleTypes", "code name")
    .sort("direction");
};

/**
 * Manager chỉ được phép đổi trạng thái cổng (active/inactive/maintenance),
 * không thêm/sửa/xóa cổng.
 */
const updateStatus = async (user, buildingId, id, status) => {
  ensureManagerOwnsBuilding(user, buildingId);
  if (!GATE_STATUS.includes(status)) {
    throw new AppError(`status must be one of: ${GATE_STATUS.join(", ")}`, 400);
  }
  const current = await Gate.findOne({ _id: id, building: buildingId });
  if (!current) throw new AppError("Gate not found", 404);

  const updated = await Gate.findByIdAndUpdate(id, { status }, { new: true });
  await writeAuditLog({
    actor: user,
    action: "UPDATE_GATE_STATUS",
    targetTable: "gates",
    targetId: id,
    building: buildingId,
    previousValue: { status: current.status },
    newValue: { status },
  });
  return updated;
};

module.exports = { list, ensureDefaultGates, updateStatus };
