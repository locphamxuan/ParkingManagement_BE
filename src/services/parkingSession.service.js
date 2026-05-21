const AppError = require('../utils/AppError');
const parkingRepo = require('../repositories/parkingSession.repository');
const buildingRepository = require('../repositories/building.repository');

const checkIn = async (user, payload) => {
  const { building: buildingId, plateNumber, vehicleType, gate } = payload;

  if (!buildingId) throw new AppError('buildingId is required', 400);
  const building = await buildingRepository.findById(buildingId);
  if (!building) throw new AppError('Building not found', 404);

  const session = await parkingRepo.create({
    plateNumber,
    vehicleType,
    building: buildingId,
    gate,
    staff: user._id,
  });

  return session;
};

const checkOut = async (user, sessionId) => {
  if (!sessionId) throw new AppError('sessionId is required', 400);
  const session = await parkingRepo.findById(sessionId);
  if (!session) throw new AppError('Parking session not found', 404);
  if (session.status !== 'active') throw new AppError('Session not active', 400);

  // Simple fee calc placeholder: 1 unit per hour
  const ms = Date.now() - new Date(session.checkInAt).getTime();
  const hours = Math.ceil(ms / (1000 * 60 * 60));
  const fee = hours * 1;

  const updated = await parkingRepo.updateById(sessionId, {
    checkOutAt: new Date(),
    status: 'closed',
    fee,
  });

  return updated;
};

const listActive = async (user) => {
  const buildingIds = Array.isArray(user.assignedBuildings) ? user.assignedBuildings : [];
  if (buildingIds.length === 0) return [];

  // For simplicity return active sessions from first assigned building
  const sessions = await parkingRepo.findActiveByBuilding(buildingIds[0]);
  return sessions;
};

const getById = async (user, id) => {
  const session = await parkingRepo.findById(id);
  if (!session) throw new AppError('Parking session not found', 404);
  return session;
};

const search = async (user, plate) => {
  if (!plate) return [];
  return parkingRepo.searchByPlate(plate);
};

module.exports = { checkIn, checkOut, listActive, getById, search };
