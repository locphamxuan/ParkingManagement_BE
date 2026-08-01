const AppError = require("../utils/AppError");
const buildingRepository = require("../repositories/building.repository");
const buildingManagerRepo = require("../repositories/buildingManager.repository");
const User = require("../models/user/User");
const Building = require("../models/building/Building");

const findUser = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw new AppError("User not found", 404);
  if (!user.isActive) throw new AppError("User account is deactivated", 400);
  return user;
};

/**
 * Ghi lại bản sao phân công lên User cho tiện tra cứu/hiển thị.
 *
 * KHÔNG phải nguồn sự thật: `BuildingManager` mới là nơi lưu phân công, và
 * `auth.middleware` dựng lại `req.user.assignedBuildings` từ đó ở mỗi request.
 * Không được dùng trường đã lưu này để quyết định phân quyền — nó có thể lệch
 * (ghi thẳng vào DB, hoặc một nhánh update lỗi giữa chừng).
 */
const syncUserAssignedBuildings = async (userId) => {
  const activeAssignments = await buildingManagerRepo.findActiveByUser(userId);
  const assignedBuildingIds = activeAssignments.map(
    (assignment) => assignment.building._id || assignment.building,
  );

  await User.updateOne(
    { _id: userId },
    {
      $set: {
        assignedBuildings: assignedBuildingIds,
      },
    },
  );

  return assignedBuildingIds;
};

const assignManagerToBuilding = async ({ buildingId, userId }) => {
  const building = await buildingRepository.findById(buildingId);
  if (!building) throw new AppError("Building not found", 404);

  const user = await findUser(userId);
  if (user.role === "admin") throw new AppError("Cannot assign admin as manager", 400);
  if (user.role === "staff") throw new AppError("User is currently a staff member. Revoke staff assignment first.", 400);

  // Enforce 1 manager : 1 building constraint
  const managerOtherBuilding = await buildingManagerRepo.findOne({
    user: userId,
    isActive: true,
    building: { $ne: buildingId },
  });
  if (managerOtherBuilding) {
    throw new AppError("User is already assigned to another building", 400);
  }

  // Toà đã có manager khác chưa? Hỏi thẳng BuildingManager — đây là nơi phân công
  // thực sự được lưu và cũng là nơi auth.middleware đọc để dựng phạm vi mỗi
  // request. Bản trước hỏi `User.assignedBuildings`, vốn chỉ là bản sao được
  // đồng bộ lại sau mỗi thay đổi: nó lệch một nhịp là toà nhận được hai manager.
  // Lọc theo role ở bước sau để không dính bản ghi của staff cùng toà.
  const activeAssignments = await buildingManagerRepo.findActiveByBuilding(buildingId);
  const existingManager = activeAssignments.find(
    (assignment) =>
      assignment.user?.role === "manager" && String(assignment.user?._id) !== String(userId),
  );
  if (existingManager) {
    throw new AppError("Building already has an active manager", 400);
  }

  const existing = await buildingManagerRepo.findOne({ building: buildingId, user: userId });
  if (existing && existing.isActive) {
    await Promise.all([
      User.updateOne({ _id: userId }, { role: "manager" }),
      Building.updateOne({ _id: buildingId }, { $set: { manager: userId } }),
      syncUserAssignedBuildings(userId),
    ]);
    return existing;
  }

  if (existing && !existing.isActive) {
    existing.isActive = true;
    existing.assignedAt = new Date();
    existing.revokedAt = null;
    await existing.save();
    await Promise.all([
      User.updateOne({ _id: userId }, { role: "manager" }),
      Building.updateOne({ _id: buildingId }, { $set: { manager: userId } }),
      syncUserAssignedBuildings(userId),
    ]);
    return existing;
  }

  const created = await buildingManagerRepo.create({ building: buildingId, user: userId });
  await Promise.all([
    User.updateOne({ _id: userId }, { role: "manager" }),
    Building.updateOne({ _id: buildingId }, { $set: { manager: userId } }),
    syncUserAssignedBuildings(userId),
  ]);
  return created;
};

const revokeManagerFromBuilding = async ({ buildingId, userId }) => {
  const updated = await buildingManagerRepo.deactivate({
    building: buildingId,
    user: userId,
    isActive: true,
  });
  if (!updated) throw new AppError("Active assignment not found", 404);

  await Promise.all([
    User.updateOne({ _id: userId }, { role: "user" }),
    Building.updateOne({ _id: buildingId, manager: userId }, { $set: { manager: null } }),
    syncUserAssignedBuildings(userId),
  ]);

  return updated;
};

const assignStaffToBuilding = async ({ buildingId, userId }) => {
  const building = await buildingRepository.findById(buildingId);
  if (!building) throw new AppError("Building not found", 404);

  const user = await findUser(userId);
  if (user.role === "admin") throw new AppError("Cannot assign admin as staff", 400);
  if (user.role === "manager") throw new AppError("User is currently a manager. Revoke manager assignment first.", 400);

  // 1 staff : 1 building constraint
  const existingOtherBuilding = await buildingManagerRepo.findOne({
    user: userId,
    isActive: true,
    building: { $ne: buildingId },
  });
  if (existingOtherBuilding) {
    throw new AppError("User is already assigned to another building", 400);
  }

  const existing = await buildingManagerRepo.findOne({ building: buildingId, user: userId });

  if (existing && existing.isActive) {
    await Promise.all([
      User.updateOne({ _id: userId }, { role: "staff" }),
      syncUserAssignedBuildings(userId),
    ]);
    return existing;
  }

  if (existing && !existing.isActive) {
    existing.isActive = true;
    existing.assignedAt = new Date();
    existing.revokedAt = null;
    await existing.save();
    await Promise.all([
      User.updateOne({ _id: userId }, { role: "staff" }),
      syncUserAssignedBuildings(userId),
    ]);
    return existing;
  }

  const created = await buildingManagerRepo.create({ building: buildingId, user: userId });
  await Promise.all([
    User.updateOne({ _id: userId }, { role: "staff" }),
    syncUserAssignedBuildings(userId),
  ]);
  return created;
};

const revokeStaffFromBuilding = async ({ buildingId, userId }) => {
  const updated = await buildingManagerRepo.deactivate({
    building: buildingId,
    user: userId,
    isActive: true,
  });
  if (!updated) throw new AppError("Active assignment not found", 404);

  await syncUserAssignedBuildings(userId);

  // Downgrade to user if no remaining active assignments
  const remaining = await buildingManagerRepo.findActiveByUser(userId);
  if (remaining.length === 0) {
    await User.updateOne({ _id: userId }, { role: "user" });
  }

  return updated;
};

const getBuildingMembers = async (buildingId) => {
  const building = await buildingRepository.findById(buildingId);
  if (!building) throw new AppError("Building not found", 404);

  const assignments = await buildingManagerRepo.findActiveByBuilding(buildingId);

  const managerAssignment = assignments.find((a) => a.user?.role === "manager");
  const staffAssignments = assignments.filter((a) => a.user?.role === "staff" && a.user?.isActive);

  return {
    manager: managerAssignment?.user ?? null,
    staff: staffAssignments.map((a) => ({
      ...a.user.toObject(),
      assignedAt: a.assignedAt,
    })),
  };
};

module.exports = {
  assignManagerToBuilding,
  revokeManagerFromBuilding,
  assignStaffToBuilding,
  revokeStaffFromBuilding,
  getBuildingMembers,
};

