const BuildingManager = require("../models/BuildingManager");

const create = (payload) => BuildingManager.create(payload);

const findActiveByUser = (userId) =>
  BuildingManager.find({ user: userId, isActive: true }).populate("building");

const findActiveByBuilding = (buildingId) =>
  BuildingManager.find({ building: buildingId, isActive: true }).populate(
    "user",
  );

const findOne = (filter) => BuildingManager.findOne(filter);

const deactivate = (filter) =>
  BuildingManager.findOneAndUpdate(
    filter,
    { isActive: false, revokedAt: new Date() },
    { new: true },
  );

module.exports = {
  create,
  findActiveByUser,
  findActiveByBuilding,
  findOne,
  deactivate,
};
