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
  if (user.role === "admin")
    throw new AppError("Cannot assign admin as manager", 400);
  if (user.role === "staff")
    throw new AppError(
      "User is currently a staff member. Revoke staff assignment first.",
      400,
    );

  // Also check existing active staff assignment records
  const existingActiveStaff = await buildingManagerRepo.findOne({
    user: userId,
    isActive: true,
    role: "staff",
  });
  if (existingActiveStaff)
    throw new AppError(
      "User is currently a staff member. Revoke staff assignment first.",
      400,
    );

  // Enforce 1 manager : 1 building constraint
  const managerOtherBuilding = await buildingManagerRepo.findOne({
    user: userId,
    isActive: true,
    role: "manager",
    building: { $ne: buildingId },
  });
  if (managerOtherBuilding) {
    throw new AppError("User is already assigned to another building", 400);
  }

  const buildingOtherManager = await buildingManagerRepo.findOne({
    building: buildingId,
    isActive: true,
    role: "manager",
    user: { $ne: userId },
  });
  if (buildingOtherManager) {
    throw new AppError("Building already has an active manager", 400);
  }

  const existing = await buildingManagerRepo.findOne({
    building: buildingId,
    user: userId,
  });
  if (existing && existing.isActive) {
    // if it's already an active assignment, ensure role is manager
    if (existing.role !== "manager") {
      existing.role = "manager";
      await existing.save();
    }
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
    existing.role = "manager";
    await existing.save();
    await Promise.all([
      User.updateOne({ _id: userId }, { role: "manager" }),
      Building.updateOne({ _id: buildingId }, { $set: { manager: userId } }),
      syncUserAssignedBuildings(userId),
    ]);
    return existing;
  }

  const created = await buildingManagerRepo.create({
    building: buildingId,
    user: userId,
    role: "manager",
  });
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
    role: "manager",
  });
  if (!updated) throw new AppError("Active assignment not found", 404);

  await Promise.all([
    User.updateOne({ _id: userId }, { role: "user" }),
    Building.updateOne(
      { _id: buildingId, manager: userId },
      { $set: { manager: null } },
    ),
    syncUserAssignedBuildings(userId),
  ]);

  return updated;
};

const assignStaffToBuilding = async ({ buildingId, userId }) => {
  const building = await buildingRepository.findById(buildingId);
  if (!building) throw new AppError("Building not found", 404);

  const user = await findUser(userId);
  if (user.role === "admin")
    throw new AppError("Cannot assign admin as staff", 400);
  if (user.role === "manager")
    throw new AppError(
      "User is currently a manager. Revoke manager assignment first.",
      400,
    );

  // Also check existing active manager assignment records
  const existingActiveManager = await buildingManagerRepo.findOne({
    user: userId,
    isActive: true,
    role: "manager",
  });
  if (existingActiveManager)
    throw new AppError(
      "User is currently a manager. Revoke manager assignment first.",
      400,
    );

  // 1 staff : 1 building constraint
  const existingOtherBuilding = await buildingManagerRepo.findOne({
    user: userId,
    isActive: true,
    building: { $ne: buildingId },
  });
  if (existingOtherBuilding) {
    throw new AppError("User is already assigned to another building", 400);
  }

  const existing = await buildingManagerRepo.findOne({
    building: buildingId,
    user: userId,
  });

  if (existing && existing.isActive) {
    if (existing.role !== "staff") {
      existing.role = "staff";
      await existing.save();
    }
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
    existing.role = "staff";
    await existing.save();
    await Promise.all([
      User.updateOne({ _id: userId }, { role: "staff" }),
      syncUserAssignedBuildings(userId),
    ]);
    return existing;
  }

  const created = await buildingManagerRepo.create({
    building: buildingId,
    user: userId,
    role: "staff",
  });
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
    role: "staff",
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

const listManagerAssignmentsForBuilding = async (buildingId) =>
  buildingManagerRepo.findActiveByBuilding(buildingId);

const listAssignmentsForUser = async (userId) =>
  buildingManagerRepo.findActiveByUser(userId);

const getBuildingMembers = async (buildingId) => {
  const building = await buildingRepository.findById(buildingId);
  if (!building) throw new AppError("Building not found", 404);

  const assignments =
    await buildingManagerRepo.findActiveByBuilding(buildingId);

  const managerAssignment =
    assignments.find((a) => a.role === "manager") ?? null;
  const staffAssignments = assignments.filter(
    (a) => a.role === "staff" && a.user?.isActive,
  );

  return {
    manager: managerAssignment
      ? {
          ...managerAssignment.user.toObject(),
          assignedAt: managerAssignment.assignedAt,
          role: managerAssignment.role,
        }
      : null,
    staff: staffAssignments.map((a) => ({
      ...a.user.toObject(),
      assignedAt: a.assignedAt,
      role: a.role,
    })),
  };
};

module.exports = {
  assignManagerToBuilding,
  revokeManagerFromBuilding,
  assignStaffToBuilding,
  revokeStaffFromBuilding,
  listManagerAssignmentsForBuilding,
  listAssignmentsForUser,
  getBuildingMembers,
};
