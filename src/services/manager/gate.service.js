const Gate = require("../../models/building/Gate");
const ParkingSession = require("../../models/operations/ParkingSession");
const AppError = require("../../utils/AppError");
const { ensureManagerOwnsBuilding } = require("../../utils/managerScope");
const { writeAuditLog } = require("../../utils/audit");

const GATE_STATUS = ["active", "inactive", "maintenance"];
const GATE_DIRECTION = ["in", "out", "both"];

// Mỗi tòa nhà được tự sinh sẵn 2 cổng mặc định: Cổng vào (in) + Cổng ra (out).
// Manager CÓ THỂ CRUD thêm/sửa/xóa cổng và đặt thể loại (in/out/both) — xem create/update/remove bên dưới.
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

const normalizeDirection = (direction) => {
  if (direction === undefined || direction === null) return undefined;
  if (!GATE_DIRECTION.includes(direction)) {
    throw new AppError(`direction must be one of: ${GATE_DIRECTION.join(", ")}`, 400);
  }
  return direction;
};

/**
 * Manager tạo cổng mới và tự đặt thể loại (ra / vào / hai chiều).
 */
const create = async (user, buildingId, payload = {}) => {
  ensureManagerOwnsBuilding(user, buildingId);
  const code = String(payload.code || "").trim().toUpperCase();
  if (!code) throw new AppError("Gate code is required", 400);

  const direction = normalizeDirection(payload.direction) || "in";

  const duplicate = await Gate.findOne({ building: buildingId, code });
  if (duplicate) throw new AppError("Mã cổng đã tồn tại trong tòa nhà", 409);

  const created = await Gate.create({
    building: buildingId,
    code,
    name: payload.name !== undefined ? String(payload.name).trim() : null,
    direction,
    status: GATE_STATUS.includes(payload.status) ? payload.status : "active",
    allowedVehicleTypes: [],
  });

  await writeAuditLog({
    actor: user,
    action: "CREATE_GATE",
    targetTable: "gates",
    targetId: created._id,
    building: buildingId,
    newValue: created.toObject(),
  });
  return created;
};

/**
 * Manager sửa cổng (mã, tên, thể loại ra/vào, trạng thái).
 */
const update = async (user, buildingId, id, payload = {}) => {
  ensureManagerOwnsBuilding(user, buildingId);
  const current = await Gate.findOne({ _id: id, building: buildingId });
  if (!current) throw new AppError("Gate not found", 404);

  const update = {};
  if (payload.code !== undefined) {
    const code = String(payload.code).trim().toUpperCase();
    if (!code) throw new AppError("Gate code cannot be empty", 400);
    if (code !== current.code) {
      const duplicate = await Gate.findOne({ building: buildingId, code, _id: { $ne: id } });
      if (duplicate) throw new AppError("Mã cổng đã tồn tại trong tòa nhà", 409);
    }
    update.code = code;
  }
  if (payload.name !== undefined) update.name = String(payload.name).trim() || null;
  const direction = normalizeDirection(payload.direction);
  if (direction !== undefined) update.direction = direction;
  if (payload.status !== undefined) {
    if (!GATE_STATUS.includes(payload.status)) {
      throw new AppError(`status must be one of: ${GATE_STATUS.join(", ")}`, 400);
    }
    update.status = payload.status;
  }

  const updated = await Gate.findByIdAndUpdate(id, update, {
    new: true,
    runValidators: true,
  });
  await writeAuditLog({
    actor: user,
    action: "UPDATE_GATE",
    targetTable: "gates",
    targetId: id,
    building: buildingId,
    previousValue: current.toObject(),
    newValue: updated.toObject(),
  });
  return updated;
};

/**
 * Manager xóa cổng. Chặn xóa nếu còn xe đang đi qua cổng này (phiên active).
 */
const remove = async (user, buildingId, id) => {
  ensureManagerOwnsBuilding(user, buildingId);
  const current = await Gate.findOne({ _id: id, building: buildingId });
  if (!current) throw new AppError("Gate not found", 404);

  const activeUsing = await ParkingSession.countDocuments({
    building: buildingId,
    status: "active",
    $or: [{ entryGate: id }, { exitGate: id }],
  });
  if (activeUsing > 0) {
    throw new AppError("Không thể xóa cổng đang có xe sử dụng (phiên gửi xe active).", 409);
  }

  await Gate.deleteOne({ _id: id });
  await writeAuditLog({
    actor: user,
    action: "DELETE_GATE",
    targetTable: "gates",
    targetId: id,
    building: buildingId,
    previousValue: current.toObject(),
    severity: "medium",
  });
  return { id };
};

/**
 * Manager đổi trạng thái cổng (active/inactive/maintenance).
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

module.exports = { list, ensureDefaultGates, create, update, remove, updateStatus };
