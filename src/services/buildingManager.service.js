const AppError = require("../utils/AppError");
const buildingRepository = require("../repositories/building.repository");
const buildingManagerRepo = require("../repositories/buildingManager.repository");
const User = require("../models/User");
const Building = require("../models/Building");

const ensureManagerUser = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw new AppError("User not found", 404);
  if (user.role !== "manager") {
    throw new AppError("User must have role manager", 400);
  }
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

  const user = await ensureManagerUser(userId);

  // check existing assignment
  const existing = await buildingManagerRepo.findOne({
    building: buildingId,
    user: userId,
  });
  if (existing && existing.isActive) {
    await Promise.all([
      Building.updateOne({ _id: buildingId }, { $set: { manager: userId } }),
      syncUserAssignedBuildings(userId),
    ]);
    return existing;
  }

  if (existing && !existing.isActive) {
    // reactivate
    existing.isActive = true;
    existing.assignedAt = new Date();
    existing.revokedAt = null;
    await existing.save();
    await Promise.all([
      Building.updateOne({ _id: buildingId }, { $set: { manager: userId } }),
      syncUserAssignedBuildings(userId),
    ]);
    return existing;
  }

  const created = await buildingManagerRepo.create({
    building: buildingId,
    user: userId,
  });
  await Promise.all([
    Building.updateOne({ _id: buildingId }, { $set: { manager: userId } }),
    syncUserAssignedBuildings(userId),
  ]);
  return created;
};

const revokeManagerFromBuilding = async ({ buildingId, userId }) => {
  await ensureManagerUser(userId);

  const updated = await buildingManagerRepo.deactivate({
    building: buildingId,
    user: userId,
    isActive: true,
  });
  if (!updated) throw new AppError("Active assignment not found", 404);

  await Promise.all([
    Building.updateOne(
      { _id: buildingId, manager: userId },
      { $set: { manager: null } },
    ),
    syncUserAssignedBuildings(userId),
  ]);

  return updated;
};

const listManagerAssignmentsForBuilding = async (buildingId) =>
  buildingManagerRepo.findActiveByBuilding(buildingId);

const listAssignmentsForUser = async (userId) =>
  buildingManagerRepo.findActiveByUser(userId);

module.exports = {
  assignManagerToBuilding,
  revokeManagerFromBuilding,
  listManagerAssignmentsForBuilding,
  listAssignmentsForUser,
};
