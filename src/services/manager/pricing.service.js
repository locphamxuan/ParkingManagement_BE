const PricePolicy = require("../../models/policy/PricePolicy");
const VehicleType = require("../../models/building/VehicleType");
const AppError = require("../../utils/AppError");
const { ensureManagerOwnsBuilding } = require("../../utils/managerScope");
const { writeAuditLog } = require("../../utils/audit");

const minutesFromHHMM = (s) => {
  const [h, m] = String(s || "00:00").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

// Khung giờ HH:MM → các đoạn [start,end) trong ngày (hỗ trợ qua nửa đêm). from==to = cả ngày.
const windowIntervals = (from, to) => {
  const a = minutesFromHHMM(from);
  const b = minutesFromHHMM(to);
  if (a === b) return [[0, 1440]];
  if (a < b) return [[a, b]];
  return [[a, 1440], [0, b]];
};

const timeWindowsOverlap = (w1, w2) => {
  const i1 = windowIntervals(w1?.from, w1?.to);
  const i2 = windowIntervals(w2?.from, w2?.to);
  return i1.some(([s1, e1]) => i2.some(([s2, e2]) => s1 < e2 && s2 < e1));
};

const datesOverlap = (aFrom, aTo, bFrom, bTo) => {
  const af = new Date(aFrom).getTime();
  const at = aTo ? new Date(aTo).getTime() : Infinity;
  const bf = new Date(bFrom).getTime();
  const bt = bTo ? new Date(bTo).getTime() : Infinity;
  return af <= bt && bf <= at;
};

// Chặn 2 bảng giá cùng loại xe + cùng type chồng KHOẢNG HIỆU LỰC (và với peak là
// chồng cả KHUNG GIỜ) — tránh fee engine lấy nhầm/cộng đôi phí.
const assertNoConflict = async (buildingId, cand, excludeId = null) => {
  if (cand.isActive === false) return;
  const filter = {
    building: buildingId,
    vehicleType: cand.vehicleType,
    type: cand.type,
    isActive: true,
  };
  if (excludeId) filter._id = { $ne: excludeId };
  const others = await PricePolicy.find(filter);
  for (const o of others) {
    if (!datesOverlap(cand.effectiveFrom, cand.effectiveTo, o.effectiveFrom, o.effectiveTo)) continue;
    if (cand.type === "peak") {
      const cw = cand.timeWindow || { from: "00:00", to: "23:59" };
      const ow = o.timeWindow || { from: "00:00", to: "23:59" };
      if (!timeWindowsOverlap(cw, ow)) continue;
    }
    throw new AppError(
      "A conflicting price policy already exists for this vehicle type and time range.",
      409,
      "PRICE_POLICY_CONFLICT",
    );
  }
};

const assertValidRate = (rate) => {
  if (Number.isNaN(rate) || rate < 0) {
    throw new AppError("hourlyRate must be a non-negative number", 400);
  }
};

const assertValidEffectiveRange = (from, to) => {
  if (to && from && new Date(to).getTime() <= new Date(from).getTime()) {
    throw new AppError("effectiveTo must be after effectiveFrom", 400);
  }
};

const list = async (user, buildingId, query = {}) => {
  ensureManagerOwnsBuilding(user, buildingId);
  const filter = { building: buildingId };
  if (query.isActive !== undefined) {
    filter.isActive = query.isActive === "true" || query.isActive === true;
  }
  if (query.vehicleType) filter.vehicleType = query.vehicleType;
  return PricePolicy.find(filter)
    .populate("vehicleType", "code name")
    .sort("-effectiveFrom");
};

const writeLog = async (user, buildingId, policy, action, previousValue, newValue) => {
  await writeAuditLog({
    actor: user,
    action: `${action.toUpperCase()}_PRICE_POLICY`,
    targetTable: "price_policies",
    targetId: policy._id,
    building: buildingId,
    previousValue,
    newValue,
    severity: "medium",
  });
};

const create = async (user, buildingId, payload) => {
  ensureManagerOwnsBuilding(user, buildingId);
  if (!payload.vehicleType) throw new AppError("vehicleType is required", 400);

  // Loại xe phải thuộc tòa nhà (tránh tham chiếu chéo tòa nhà).
  const vtExists = await VehicleType.exists({ _id: payload.vehicleType, building: buildingId });
  if (!vtExists) throw new AppError("Vehicle type not found in this building", 404);

  const type = payload.type === 'peak' ? 'peak' : 'regular';
  const hourlyRate = Number(payload.hourlyRate);
  const effectiveFrom = payload.effectiveFrom || new Date();
  const effectiveTo = payload.effectiveTo || null;
  assertValidRate(hourlyRate);
  assertValidEffectiveRange(effectiveFrom, effectiveTo);
  await assertNoConflict(buildingId, {
    vehicleType: payload.vehicleType,
    type,
    timeWindow: payload.timeWindow,
    effectiveFrom,
    effectiveTo,
    isActive: payload.isActive !== false,
  });

  const created = await PricePolicy.create({
    building: buildingId,
    vehicleType: payload.vehicleType,
    name: String(payload.name || "").trim(),
    type,
    hourlyRate,
    timeWindow: payload.timeWindow || undefined,
    effectiveFrom,
    effectiveTo,
    isActive: payload.isActive !== false,
  });
  await writeLog(user, buildingId, created, "create", null, created.toObject());
  return created;
};

const update = async (user, buildingId, id, payload) => {
  ensureManagerOwnsBuilding(user, buildingId);
  const current = await PricePolicy.findOne({ _id: id, building: buildingId });
  if (!current) throw new AppError("Price policy not found", 404);

  const update = {};
  ["name", "vehicleType", "type", "timeWindow", "effectiveFrom", "effectiveTo"].forEach((k) => {
    if (payload[k] !== undefined) update[k] = payload[k];
  });
  if (payload.type !== undefined) update.type = payload.type === 'peak' ? 'peak' : 'regular';
  if (payload.hourlyRate !== undefined) update.hourlyRate = Number(payload.hourlyRate);
  if (payload.isActive !== undefined) update.isActive = !!payload.isActive;

  if (payload.vehicleType !== undefined) {
    const vtExists = await VehicleType.exists({ _id: payload.vehicleType, building: buildingId });
    if (!vtExists) throw new AppError("Vehicle type not found in this building", 404);
  }
  if (update.hourlyRate !== undefined) assertValidRate(update.hourlyRate);

  // Giá trị HIỆU LỰC sau cập nhật (gộp current + payload) để kiểm tra trùng/chồng lấn.
  const merged = {
    vehicleType: update.vehicleType ?? current.vehicleType,
    type: update.type ?? current.type,
    timeWindow: update.timeWindow ?? current.timeWindow,
    effectiveFrom: update.effectiveFrom ?? current.effectiveFrom,
    effectiveTo: update.effectiveTo !== undefined ? update.effectiveTo : current.effectiveTo,
    isActive: update.isActive ?? current.isActive,
  };
  assertValidEffectiveRange(merged.effectiveFrom, merged.effectiveTo);
  await assertNoConflict(buildingId, merged, id);

  const updated = await PricePolicy.findByIdAndUpdate(id, update, {
    new: true,
    runValidators: true,
  });
  await writeLog(
    user,
    buildingId,
    updated,
    "update",
    current.toObject(),
    updated.toObject()
  );
  return updated;
};

const deactivate = async (user, buildingId, id) => {
  ensureManagerOwnsBuilding(user, buildingId);
  const current = await PricePolicy.findOne({ _id: id, building: buildingId });
  if (!current) throw new AppError("Price policy not found", 404);

  const updated = await PricePolicy.findByIdAndUpdate(
    id,
    { isActive: false },
    { new: true }
  );
  await writeLog(
    user,
    buildingId,
    updated,
    "deactivate",
    current.toObject(),
    updated.toObject()
  );
  return updated;
};

module.exports = { list, create, update, deactivate };

