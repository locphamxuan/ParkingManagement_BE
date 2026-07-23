const Floor = require("../../models/building/Floor");
const ParkingSlot = require("../../models/building/ParkingSlot");
const Zone = require("../../models/building/Zone");
const AppError = require("../../utils/AppError");
const { ensureManagerOwnsBuilding } = require("../../utils/managerScope");
const { writeAuditLog } = require("../../utils/audit");
const { initialsCode } = require("../../utils/codeFromName");

const list = async (user, buildingId) => {
  ensureManagerOwnsBuilding(user, buildingId);
  return Floor.find({ building: buildingId })
    .populate("allowedVehicleTypes", "code name")
    .sort("code");
};

const getById = async (user, buildingId, id) => {
  ensureManagerOwnsBuilding(user, buildingId);
  const floor = await Floor.findOne({ _id: id, building: buildingId }).populate(
    "allowedVehicleTypes",
    "code name"
  );
  if (!floor) throw new AppError("Floor not found", 404);
  return floor;
};

// Code tầng sinh từ tên ("Tầng 1" → T1, "Hầm B1" → HB1), unique theo tòa nhà —
// trùng thì thêm số đuôi (TT → TT2). Client chỉ đặt tên.
const nextFloorCode = async (buildingId, name) => {
  const base = initialsCode(name, { fallback: "F" });
  const codes = new Set(await Floor.find({ building: buildingId }).distinct("code"));
  if (!codes.has(base)) return base;
  let n = 2;
  while (codes.has(`${base}${n}`)) n += 1;
  return `${base}${n}`;
};

const create = async (user, buildingId, payload) => {
  ensureManagerOwnsBuilding(user, buildingId);
  const doc = {
    building: buildingId,
    name: String(payload.name || "").trim(),
    capacity: Number(payload.capacity ?? 0),
    allowedVehicleTypes: Array.isArray(payload.allowedVehicleTypes)
      ? payload.allowedVehicleTypes
      : [],
    status: payload.status || "active",
  };
  let created;
  try {
    created = await Floor.create({ ...doc, code: await nextFloorCode(buildingId, doc.name) });
  } catch (err) {
    // Race hiếm: 2 request cùng sinh một code → thử lại một lần với code mới.
    if (err?.code !== 11000) throw err;
    created = await Floor.create({ ...doc, code: await nextFloorCode(buildingId, doc.name) });
  }
  await writeAuditLog({
    actor: user,
    action: "CREATE_FLOOR",
    targetTable: "floors",
    targetId: created._id,
    building: buildingId,
    newValue: created.toObject(),
  });
  return created;
};

const update = async (user, buildingId, id, payload) => {
  ensureManagerOwnsBuilding(user, buildingId);
  const current = await Floor.findOne({ _id: id, building: buildingId });
  if (!current) throw new AppError("Floor not found", 404);

  const update = {};
  ["status"].forEach((k) => {
    if (payload[k] !== undefined) update[k] = payload[k];
  });
  if (payload.name !== undefined) update.name = String(payload.name).trim();
  if (payload.capacity !== undefined) update.capacity = Number(payload.capacity);
  if (Array.isArray(payload.allowedVehicleTypes))
    update.allowedVehicleTypes = payload.allowedVehicleTypes;

  // Giảm capacity tầng không được xuống dưới TỔNG capacity các dãy hiện có, cũng không
  // dưới SỐ SLOT đã tạo — nếu không sẽ phá vỡ ràng buộc slot ≤ dãy ≤ tổng ≤ tầng.
  if (update.capacity !== undefined && update.capacity > 0) {
    const [zoneAgg, slotCount] = await Promise.all([
      Zone.aggregate([
        { $match: { floor: current._id } },
        { $group: { _id: null, total: { $sum: "$capacity" } } },
      ]),
      ParkingSlot.countDocuments({ floor: current._id }),
    ]);
    const zoneTotal = zoneAgg[0]?.total || 0;
    if (update.capacity < zoneTotal) {
      throw new AppError(
        `Floor capacity (${update.capacity}) is below the total zone capacity (${zoneTotal}). Reduce zone capacities first.`,
        409,
        "FLOOR_CAPACITY_BELOW_ZONES",
      );
    }
    if (update.capacity < slotCount) {
      throw new AppError(
        `Floor capacity (${update.capacity}) is below the current slot count (${slotCount}). Remove slots first.`,
        409,
        "FLOOR_CAPACITY_BELOW_SLOTS",
      );
    }
  }

  const updated = await Floor.findByIdAndUpdate(id, update, {
    new: true,
    runValidators: true,
  });
  await writeAuditLog({
    actor: user,
    action: "UPDATE_FLOOR",
    targetTable: "floors",
    targetId: id,
    building: buildingId,
    previousValue: current.toObject(),
    newValue: updated.toObject(),
  });
  return updated;
};

const { ParkingSession, LongTermSubscription } = require("../../models");

const remove = async (user, buildingId, id) => {
  ensureManagerOwnsBuilding(user, buildingId);
  const current = await Floor.findOne({ _id: id, building: buildingId });
  if (!current) throw new AppError("Floor not found", 404);

  const floorSlots = await ParkingSlot.find({ floor: id });
  const slotIds = floorSlots.map((s) => s._id);

  if (slotIds.length > 0) {
    const activeSessionsCount = await ParkingSession.countDocuments({
      slot: { $in: slotIds },
      status: "active",
    });
    if (activeSessionsCount > 0) {
      throw new AppError(
        "Floor has active parked vehicles. Release vehicles before deleting the floor.",
        409,
        "FLOOR_HAS_ACTIVE_SESSIONS"
      );
    }

    const activeSubsCount = await LongTermSubscription.countDocuments({
      slot: { $in: slotIds },
      status: "active",
    });
    if (activeSubsCount > 0) {
      throw new AppError(
        "Floor has active package subscriptions. Cancel or reassign subscriptions first.",
        409,
        "FLOOR_HAS_ACTIVE_SUBSCRIPTIONS"
      );
    }
  }

  // Cascade delete slots and zones belonging to this floor
  await ParkingSlot.deleteMany({ floor: id });
  await Zone.deleteMany({ floor: id });
  await Floor.deleteOne({ _id: id });

  await writeAuditLog({
    actor: user,
    action: "DELETE_FLOOR",
    targetTable: "floors",
    targetId: id,
    building: buildingId,
    previousValue: current.toObject(),
    severity: "medium",
  });
  return { id };
};

module.exports = { list, getById, create, update, remove };

