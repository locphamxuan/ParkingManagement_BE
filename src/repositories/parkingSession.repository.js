const ParkingSession = require('../models/ParkingSession');

const create = async (data) => {
  const doc = new ParkingSession(data);
  return doc.save();
};

const findById = async (id) => ParkingSession.findById(id);

const findActiveByBuilding = async (buildingId) =>
  ParkingSession.find({ building: buildingId, status: 'active' }).sort({ checkInAt: -1 });

const searchByPlate = async (plate) =>
  ParkingSession.find({ plateNumber: { $regex: plate, $options: 'i' } }).sort({ checkInAt: -1 });

const updateById = async (id, update) =>
  ParkingSession.findByIdAndUpdate(id, update, { new: true });

module.exports = { create, findById, findActiveByBuilding, searchByPlate, updateById };
