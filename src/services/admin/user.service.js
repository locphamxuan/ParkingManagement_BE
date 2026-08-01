const User = require("../../models/user/User");
const Vehicle = require("../../models/vehicle/Vehicle");
const BuildingManager = require("../../models/building/BuildingManager");
const StaffShift = require("../../models/operations/StaffShift");
const ParkingSession = require("../../models/operations/ParkingSession");
const LongTermSubscription = require("../../models/policy/LongTermSubscription");
const { Payment, WalletTransaction, Notification } = require('../../models');
const AppError = require("../../utils/AppError");
const { ROLES, ROLE_LIST } = require("../../constants/roles");
const { writeAuditLog } = require("../../utils/audit");
const { revokeStaffFromBuilding, revokeManagerFromBuilding } = require('../buildingManager.service');
const { assertStrongPassword } = require('../../utils/passwordPolicy');

const ADMIN_PROVISIONING_MESSAGE =
  'Admin accounts are provisioned through the deployment/bootstrap process, not the user-management screen.';

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
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);

  // Xe nằm ở collection riêng nên phải nạp kèm; gom một lượt cho cả trang thay vì
  // hỏi từng user, và chỉ lấy các trường admin thực sự hiển thị.
  const vehicles = await Vehicle.find({ owner: { $in: items.map((u) => u._id) } })
    .select("owner plateNumber category")
    .lean();
  const vehiclesByOwner = new Map();
  vehicles.forEach((vehicle) => {
    const owned = vehiclesByOwner.get(String(vehicle.owner)) || [];
    owned.push({ plateNumber: vehicle.plateNumber, category: vehicle.category });
    vehiclesByOwner.set(String(vehicle.owner), owned);
  });

  // Phân công đọc từ BuildingManager chứ không lấy `User.assignedBuildings` đã lưu:
  // trường đó chỉ là bản sao, lệch một nhịp là màn admin hiện sai ai đang rảnh để
  // giao toà. Gom một lượt cho cả trang, cùng kiểu với phần xe ở trên.
  const assignments = await BuildingManager.find({
    user: { $in: items.map((u) => u._id) },
    isActive: true,
  })
    .select("user building")
    .lean();
  const buildingsByUser = new Map();
  assignments.forEach((assignment) => {
    const owned = buildingsByUser.get(String(assignment.user)) || [];
    owned.push(assignment.building);
    buildingsByUser.set(String(assignment.user), owned);
  });

  return {
    items: items.map((item) => ({
      ...item,
      vehicles: vehiclesByOwner.get(String(item._id)) || [],
      assignedBuildings: buildingsByUser.get(String(item._id)) || [],
    })),
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
  if (payload.role === ROLES.ADMIN) {
    throw new AppError(ADMIN_PROVISIONING_MESSAGE, 403, 'ADMIN_PROVISIONING_FORBIDDEN');
  }
  assertStrongPassword(payload.password);

  const exists = await User.exists({ email: payload.email });
  if (exists) throw new AppError("Email already registered", 409);

  const created = await User.create({
    email: String(payload.email).trim().toLowerCase(),
    password: payload.password,
    fullName: String(payload.fullName).trim(),
    // undefined (không phải "") để field hoàn toàn không tồn tại trên document —
    // khớp với sparse unique index của phone, tránh 2 user không nhập SĐT đụng E11000.
    phone: payload.phone ? String(payload.phone).trim() : undefined,
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
    // Privilege escalation: nothing reachable from the UI may mint an admin.
    // Note the existing ADMIN_ROLE_IMMUTABLE guard below only protects accounts
    // that are ALREADY admin — it does not stop promoting a plain user.
    if (payload.role === ROLES.ADMIN) {
      throw new AppError(ADMIN_PROVISIONING_MESSAGE, 403, 'ADMIN_PROVISIONING_FORBIDDEN');
    }
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
    if (current.role === ROLES.ADMIN && payload.role !== ROLES.ADMIN) {
      throw new AppError('Cannot change the role of an admin account', 400, 'ADMIN_ROLE_IMMUTABLE');
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
  if (payload.isActive !== undefined) {
    if (current.role === ROLES.ADMIN && !payload.isActive) {
      throw new AppError('Cannot deactivate an admin account', 400, 'ADMIN_STATUS_IMMUTABLE');
    }
    update.isActive = !!payload.isActive;
  }

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

  // Khóa vẫn được phép khi user còn phiên gửi xe / gói active (chặn kẻ xấu ngay lập tức
  // là ưu tiên; staff checkout không phụ thuộc login của user) — nhưng ghi rõ vào audit
  // để admin biết xe của user vẫn đang trong bãi.
  const [activeSessions, activeSubscriptions] = !isActive
    ? await Promise.all([
        ParkingSession.countDocuments({ user: id, status: "active" }),
        LongTermSubscription.countDocuments({ user: id, status: "active" }),
      ])
    : [0, 0];

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
    newValue: { isActive: !!isActive, activeSessions, activeSubscriptions },
    severity: !isActive && (activeSessions > 0 || activeSubscriptions > 0) ? "high" : "medium",
  });
  return updated;
};

const remove = async (actor, id, { force = false } = {}) => {
  const current = await getById(id);
  if (current.role === ROLES.ADMIN) {
    throw new AppError("Cannot delete admin account", 400);
  }
  // Chặn XÓA khi user còn phiên gửi xe active (xe vẫn trong bãi — xóa sẽ mồ côi
  // session.user, checkout/ví sẽ gãy) hoặc gói dài hạn active (mất dấu tiền gói).
  // force KHÔNG bypass được 2 guard này — chỉ bypass building assignment bên dưới.
  const [activeSessions, activeSubs] = await Promise.all([
    ParkingSession.countDocuments({ user: id, status: "active" }),
    LongTermSubscription.countDocuments({ user: id, status: "active" }),
  ]);
  if (activeSessions > 0) {
    throw new AppError(
      `User has ${activeSessions} active parking session(s) — the vehicle is still parked. Check out first.`,
      409,
      "USER_HAS_ACTIVE_SESSION",
    );
  }
  if (activeSubs > 0) {
    throw new AppError(
      `User has ${activeSubs} active long-term subscription(s). Cancel them first.`,
      409,
      "USER_HAS_ACTIVE_SUBSCRIPTION",
    );
  }

  const hasHistoricalRecords = await Promise.all([
    ParkingSession.exists({ $or: [{ user: id }, { staff: id }] }),
    LongTermSubscription.exists({ user: id }),
    Payment.exists({ $or: [{ user: id }, { staff: id }] }),
    WalletTransaction.exists({ user: id }),
    Notification.exists({ user: id }),
  ]);
  if (hasHistoricalRecords.some(Boolean)) {
    throw new AppError(
      'This account has operational or financial history and cannot be deleted. Lock the account instead so audit records remain traceable.',
      409,
      'USER_HAS_HISTORY',
    );
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

  // Cascade-clean operational references so we never leave orphaned documents
  // pointing at a deleted user (which would break the manager "Gán ca" page):
  //  - StaffShift: the user can no longer be on any shift → remove the rows.
  //  - ParkingSession: keep historical records, just detach the staff ref.
  //  - BuildingManager: drop any leftover mappings (active ones revoked above).
  await StaffShift.deleteMany({ staff: id });
  await ParkingSession.updateMany({ staff: id }, { $set: { staff: null } });
  await BuildingManager.deleteMany({ user: id });

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

