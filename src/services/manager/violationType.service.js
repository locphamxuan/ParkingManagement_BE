const ViolationType = require("../../models/policy/ViolationType");
const AppError = require("../../utils/AppError");
const { ensureManagerOwnsBuilding } = require("../../utils/managerScope");
const { writeAuditLog } = require("../../utils/audit");

// Bộ giá khởi tạo khi building chưa cấu hình gì (giống pattern DEFAULT_POLICY của
// refundPolicy.service) — CHỈ là điểm khởi đầu, manager sửa/xoá/thêm tự do
// ngay sau đó; không phải mức phí cố định trong code.
const DEFAULT_VIOLATION_TYPES = [
  { code: "wrong_spot", label: "Wrong spot / wrong vehicle type", fee: 50000 },
  { code: "slot_occupied", label: "Occupying another customer's reserved slot", fee: 100000 },
  { code: "slot_blocked", label: "Blocking lane / obstructing a slot", fee: 50000 },
  { code: "equipment_damage", label: "Damaged parking equipment", fee: 200000 },
  { code: "plate_mismatch", label: "Plate mismatch / forged plate", fee: 100000 },
  { code: "gate_violation", label: "Unauthorized gate entry/exit", fee: 150000 },
];

const slugify = (label) =>
  String(label)
    .trim()
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);

const validatePayload = (payload, { isCreate }) => {
  if (isCreate || payload.label !== undefined) {
    if (!String(payload.label || "").trim()) {
      throw new AppError("label is required", 400);
    }
  }
  if (isCreate || payload.fee !== undefined) {
    const v = Number(payload.fee);
    if (!Number.isFinite(v) || v < 0) {
      throw new AppError("fee must be a non-negative number", 400);
    }
  }
};

/** List — seeds the default table on first access so managers don't start empty-handed. */
const list = async (user, buildingId, { includeInactive = false } = {}) => {
  ensureManagerOwnsBuilding(user, buildingId);
  const count = await ViolationType.countDocuments({ building: buildingId });
  if (count === 0) {
    await ViolationType.insertMany(
      DEFAULT_VIOLATION_TYPES.map((v) => ({ ...v, building: buildingId }))
    );
  }
  const filter = { building: buildingId };
  if (!includeInactive) filter.isActive = true;
  return ViolationType.find(filter).sort("label");
};

const create = async (user, buildingId, payload = {}) => {
  ensureManagerOwnsBuilding(user, buildingId);
  validatePayload(payload, { isCreate: true });

  const code = payload.code ? slugify(payload.code) : slugify(payload.label);
  if (!code) throw new AppError("Could not derive a valid code from label", 400);

  const existing = await ViolationType.findOne({ building: buildingId, code });
  if (existing) throw new AppError("A violation type with this name already exists", 409);

  const item = await ViolationType.create({
    building: buildingId,
    code,
    label: String(payload.label).trim(),
    fee: Number(payload.fee),
  });

  await writeAuditLog({
    actor: user,
    action: "CREATE_VIOLATION_TYPE",
    targetTable: "violation_types",
    targetId: item._id,
    building: buildingId,
    newValue: item.toObject(),
    severity: "low",
  });

  return item;
};

const update = async (user, buildingId, id, payload = {}) => {
  ensureManagerOwnsBuilding(user, buildingId);
  validatePayload(payload, { isCreate: false });

  const item = await ViolationType.findOne({ _id: id, building: buildingId });
  if (!item) throw new AppError("Violation type not found", 404);
  const before = item.toObject();

  if (payload.label !== undefined) item.label = String(payload.label).trim();
  if (payload.fee !== undefined) item.fee = Number(payload.fee);
  if (payload.isActive !== undefined) item.isActive = !!payload.isActive;
  await item.save();

  await writeAuditLog({
    actor: user,
    action: "UPDATE_VIOLATION_TYPE",
    targetTable: "violation_types",
    targetId: item._id,
    building: buildingId,
    previousValue: before,
    newValue: item.toObject(),
    severity: "low",
  });

  return item;
};

const remove = async (user, buildingId, id) => {
  ensureManagerOwnsBuilding(user, buildingId);
  const item = await ViolationType.findOneAndDelete({ _id: id, building: buildingId });
  if (!item) throw new AppError("Violation type not found", 404);

  await writeAuditLog({
    actor: user,
    action: "DELETE_VIOLATION_TYPE",
    targetTable: "violation_types",
    targetId: item._id,
    building: buildingId,
    previousValue: item.toObject(),
    severity: "medium",
  });

  return item;
};

module.exports = { list, create, update, remove, DEFAULT_VIOLATION_TYPES };
