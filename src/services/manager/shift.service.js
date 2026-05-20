const Shift = require("../../models/operations/Shift");
const StaffShift = require("../../models/operations/StaffShift");
const ShiftRevenue = require("../../models/finance/ShiftRevenue");
const User = require("../../models/user/User");
const AppError = require("../../utils/AppError");
const { ROLES } = require("../../constants/roles");
const { ensureManagerOwnsBuilding } = require("../../utils/managerScope");
const { writeAuditLog } = require("../../utils/audit");

const listShifts = async (user, buildingId) => {
  ensureManagerOwnsBuilding(user, buildingId);
  return Shift.find({ building: buildingId }).sort("startTime");
};

const createShift = async (user, buildingId, payload) => {
  ensureManagerOwnsBuilding(user, buildingId);
  const created = await Shift.create({
    building: buildingId,
    name: String(payload.name || "").trim(),
    code: String(payload.code || "").trim().toUpperCase(),
    startTime: payload.startTime,
    endTime: payload.endTime,
    isActive: payload.isActive !== false,
  });
  await writeAuditLog({
    actor: user,
    action: "CREATE_SHIFT",
    targetTable: "shifts",
    targetId: created._id,
    building: buildingId,
    newValue: created.toObject(),
  });
  return created;
};

const updateShift = async (user, buildingId, id, payload) => {
  ensureManagerOwnsBuilding(user, buildingId);
  const current = await Shift.findOne({ _id: id, building: buildingId });
  if (!current) throw new AppError("Shift not found", 404);

  const update = {};
  ["name", "startTime", "endTime"].forEach((k) => {
    if (payload[k] !== undefined) update[k] = payload[k];
  });
  if (payload.code !== undefined)
    update.code = String(payload.code).trim().toUpperCase();
  if (payload.isActive !== undefined) update.isActive = !!payload.isActive;

  const updated = await Shift.findByIdAndUpdate(id, update, {
    new: true,
    runValidators: true,
  });
  await writeAuditLog({
    actor: user,
    action: "UPDATE_SHIFT",
    targetTable: "shifts",
    targetId: id,
    building: buildingId,
    previousValue: current.toObject(),
    newValue: updated.toObject(),
  });
  return updated;
};

const removeShift = async (user, buildingId, id) => {
  ensureManagerOwnsBuilding(user, buildingId);
  const current = await Shift.findOne({ _id: id, building: buildingId });
  if (!current) throw new AppError("Shift not found", 404);

  const assigned = await StaffShift.countDocuments({
    shift: id,
    status: { $in: ["scheduled", "active"] },
  });
  if (assigned > 0) {
    throw new AppError("Shift has active staff assignments", 409);
  }

  await Shift.deleteOne({ _id: id });
  await writeAuditLog({
    actor: user,
    action: "DELETE_SHIFT",
    targetTable: "shifts",
    targetId: id,
    building: buildingId,
    previousValue: current.toObject(),
    severity: "medium",
  });
  return { id };
};

const listStaffShifts = async (user, buildingId, query = {}) => {
  ensureManagerOwnsBuilding(user, buildingId);
  const filter = { building: buildingId };
  if (query.from || query.to) {
    filter.workDate = {};
    if (query.from) filter.workDate.$gte = new Date(query.from);
    if (query.to) filter.workDate.$lte = new Date(query.to);
  }
  if (query.shift) filter.shift = query.shift;
  if (query.staff) filter.staff = query.staff;
  if (query.status) filter.status = query.status;

  return StaffShift.find(filter)
    .populate("staff", "fullName email phone role")
    .populate("shift", "code name startTime endTime")
    .sort({ workDate: -1, "shift.startTime": 1 });
};

const assignStaffShift = async (user, buildingId, payload) => {
  ensureManagerOwnsBuilding(user, buildingId);
  if (!payload.shift) throw new AppError("shift is required", 400);
  if (!payload.staff) throw new AppError("staff is required", 400);
  if (!payload.workDate) throw new AppError("workDate is required", 400);

  const shift = await Shift.findOne({ _id: payload.shift, building: buildingId });
  if (!shift) throw new AppError("Shift not found in this building", 404);

  const staff = await User.findById(payload.staff);
  if (!staff || staff.role !== ROLES.STAFF) {
    throw new AppError("Selected user must have role staff", 400);
  }

  const created = await StaffShift.create({
    building: buildingId,
    shift: payload.shift,
    staff: payload.staff,
    workDate: new Date(payload.workDate),
    status: payload.status || "scheduled",
    note: payload.note || "",
  });
  await writeAuditLog({
    actor: user,
    action: "ASSIGN_STAFF_SHIFT",
    targetTable: "staff_shifts",
    targetId: created._id,
    building: buildingId,
    newValue: created.toObject(),
  });
  return created;
};

const updateStaffShift = async (user, buildingId, id, payload) => {
  ensureManagerOwnsBuilding(user, buildingId);
  const current = await StaffShift.findOne({ _id: id, building: buildingId });
  if (!current) throw new AppError("Staff shift not found", 404);

  const update = {};
  if (payload.workDate !== undefined) update.workDate = new Date(payload.workDate);
  if (payload.status !== undefined) update.status = payload.status;
  if (payload.note !== undefined) update.note = payload.note;
  if (payload.shift !== undefined) update.shift = payload.shift;
  if (payload.staff !== undefined) update.staff = payload.staff;

  const updated = await StaffShift.findByIdAndUpdate(id, update, {
    new: true,
    runValidators: true,
  });
  await writeAuditLog({
    actor: user,
    action: "UPDATE_STAFF_SHIFT",
    targetTable: "staff_shifts",
    targetId: id,
    building: buildingId,
    previousValue: current.toObject(),
    newValue: updated.toObject(),
  });
  return updated;
};

const removeStaffShift = async (user, buildingId, id) => {
  ensureManagerOwnsBuilding(user, buildingId);
  const current = await StaffShift.findOne({ _id: id, building: buildingId });
  if (!current) throw new AppError("Staff shift not found", 404);
  await StaffShift.deleteOne({ _id: id });
  await writeAuditLog({
    actor: user,
    action: "DELETE_STAFF_SHIFT",
    targetTable: "staff_shifts",
    targetId: id,
    building: buildingId,
    previousValue: current.toObject(),
    severity: "medium",
  });
  return { id };
};

const listAvailableStaff = async (user, buildingId) => {
  ensureManagerOwnsBuilding(user, buildingId);
  return User.find({ role: ROLES.STAFF, isActive: true })
    .select("fullName email phone role isActive")
    .sort("fullName");
};

const listShiftRevenues = async (user, buildingId, query = {}) => {
  ensureManagerOwnsBuilding(user, buildingId);
  const filter = { building: buildingId };
  if (query.from || query.to) {
    filter.workDate = {};
    if (query.from) filter.workDate.$gte = new Date(query.from);
    if (query.to) filter.workDate.$lte = new Date(query.to);
  }
  if (query.shift) filter.shift = query.shift;
  if (query.staff) filter.staff = query.staff;

  const items = await ShiftRevenue.find(filter)
    .populate("staff", "fullName email")
    .populate("shift", "code name startTime endTime")
    .sort("-workDate");

  const totals = items.reduce(
    (acc, row) => {
      acc.sessionCount += row.sessionCount || 0;
      acc.totalRevenue += row.totalRevenue || 0;
      acc.cashAmount += row.cashAmount || 0;
      acc.walletAmount += row.walletAmount || 0;
      acc.qrAmount += row.qrAmount || 0;
      return acc;
    },
    { sessionCount: 0, totalRevenue: 0, cashAmount: 0, walletAmount: 0, qrAmount: 0 }
  );

  return { items, totals };
};

module.exports = {
  listShifts,
  createShift,
  updateShift,
  removeShift,
  listStaffShifts,
  assignStaffShift,
  updateStaffShift,
  removeStaffShift,
  listAvailableStaff,
  listShiftRevenues,
};

