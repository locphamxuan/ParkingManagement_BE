const User = require("../../models/user/User");
const BuildingManager = require("../../models/building/BuildingManager");
const AppError = require("../../utils/AppError");
const { ROLES, ROLE_LIST } = require("../../constants/roles");
const { writeAuditLog } = require("../../utils/audit");
const { revokeStaffFromBuilding, revokeManagerFromBuilding } = require('../buildingManager.service');

const buildFilter = (query = {}) => {
  const filter = {};
  if (query.role) filter.role = query.role;
  if (query.isActive !== undefined) {
    filter.isActive = query.isActive === "true" || query.isActive === true;
  }
  if (query.search?.trim()) {
    const s = query.search.trim();
    filter.$or = [
      { fullName: { $regex: s, $options: "i" } },
      { email: { $regex: s, $options: "i" } },
      { phone: { $regex: s, $options: "i" } },
    ];
  }
  return filter;
};

const list = async (query = {}) => {
  const filter = buildFilter(query);
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 500);

  const [items, total] = await Promise.all([
    User.find(filter)
      .sort("-createdAt")
      .skip((page - 1) * limit)
      .limit(limit),
    User.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

const getById = async (id) => {
  const user = await User.findById(id);
  if (!user) throw new AppError("User not found", 404);
  return user;
};

const create = async (actor, payload) => {
  if (!payload.email || !payload.password || !payload.fullName) {
    throw new AppError("email, password, fullName are required", 400);
  }
  if (payload.role && !ROLE_LIST.includes(payload.role)) {
    throw new AppError(
      `role must be one of: ${ROLE_LIST.join(", ")}`,
      400
    );
  }

  const exists = await User.exists({ email: payload.email });
  if (exists) throw new AppError("Email already registered", 409);

  const created = await User.create({
    email: String(payload.email).trim().toLowerCase(),
    password: payload.password,
    fullName: String(payload.fullName).trim(),
    phone: payload.phone || "",
    role: payload.role || ROLES.USER,
    isActive: payload.isActive !== false,
  });

  await writeAuditLog({
    actor,
    action: "CREATE_USER",
    targetTable: "users",
    targetId: created._id,
    newValue: {
      email: created.email,
      role: created.role,
      fullName: created.fullName,
    },
    severity: "medium",
  });

  return created;
};

const update = async (actor, id, payload) => {
  const current = await getById(id);

  const update = {};
  ["fullName", "phone", "avatar"].forEach((k) => {
    if (payload[k] !== undefined) update[k] = payload[k];
  });
  if (payload.role !== undefined) {
    if (!ROLE_LIST.includes(payload.role))
      throw new AppError(`role must be one of: ${ROLE_LIST.join(", ")}`, 400);
    // Không cho phép gán/tháo role staff hoặc manager trực tiếp.
    // Phải dùng đúng endpoint:
    //   POST /admin/buildings/:buildingId/assign-staff   → role staff
    //   POST /admin/buildings/:buildingId/assign-manager → role manager
    //   POST /admin/buildings/:buildingId/revoke-staff   → role về user
    //   POST /admin/buildings/:buildingId/revoke-manager → role về user
    if (['staff', 'manager'].includes(payload.role)) {
      throw new AppError(
        `Cannot set role to "${payload.role}" directly. ` +
        `Use POST /admin/buildings/:buildingId/assign-${payload.role} instead.`,
        400,
        'USE_ASSIGNMENT_ENDPOINT',
      );
    }
    if (['staff', 'manager'].includes(current.role)) {
      throw new AppError(
        `Cannot change role of a ${current.role} directly. ` +
        `Use POST /admin/buildings/:buildingId/revoke-${current.role} first.`,
        400,
        'USE_REVOKE_ENDPOINT',
      );
    }
    update.role = payload.role;
  }
  if (payload.isActive !== undefined) update.isActive = !!payload.isActive;

  const updated = await User.findByIdAndUpdate(id, update, {
    new: true,
    runValidators: true,
  });

  await writeAuditLog({
    actor,
    action: "UPDATE_USER",
    targetTable: "users",
    targetId: id,
    previousValue: {
      email: current.email,
      role: current.role,
      isActive: current.isActive,
    },
    newValue: { role: updated.role, isActive: updated.isActive },
  });

  return updated;
};

const updateStatus = async (actor, id, isActive) => {
  const current = await getById(id);
  if (current.role === ROLES.ADMIN) {
    throw new AppError("Cannot change status of admin account", 400);
  }

  const updated = await User.findByIdAndUpdate(
    id,
    { isActive: !!isActive },
    { new: true }
  );
  if (!updated) throw new AppError("User not found", 404);
  await writeAuditLog({
    actor,
    action: isActive ? "UNLOCK_USER" : "LOCK_USER",
    targetTable: "users",
    targetId: id,
    previousValue: { isActive: current.isActive, role: current.role },
    newValue: { isActive: !!isActive },
    severity: "medium",
  });
  return updated;
};

const remove = async (actor, id, { force = false } = {}) => {
  const current = await getById(id);
  if (current.role === ROLES.ADMIN) {
    throw new AppError("Cannot delete admin account", 400);
  }
  const activeMappings = await BuildingManager.find({ user: id, isActive: true });
  if (activeMappings.length > 0) {
    if (!force) {
      throw new AppError(
        "User still assigned to buildings. Revoke first or use ?force=true.",
        409,
      );
    }
    // Force: revoke all building assignments first
    for (const mapping of activeMappings) {
      if (current.role === ROLES.STAFF || current.role === 'staff') {
        await revokeStaffFromBuilding({ buildingId: mapping.building, userId: id });
      } else if (current.role === ROLES.MANAGER || current.role === 'manager') {
        await revokeManagerFromBuilding({ buildingId: mapping.building, userId: id });
      }
    }
  }
  await User.deleteOne({ _id: id });
  await writeAuditLog({
    actor,
    action: "DELETE_USER",
    targetTable: "users",
    targetId: id,
    previousValue: {
      email: current.email,
      role: current.role,
    },
    severity: "high",
  });
  return { id };
};

module.exports = { list, getById, create, update, updateStatus, remove };

