const mongoose = require('mongoose');
const { Gate } = require('../../models');
const AppError = require('../../utils/AppError');

const directionAllows = (gateDirection, operation) =>
  gateDirection === 'both' || gateDirection === operation;

/**
 * Resolve a gate used by an operational event.  A staff member assigned to a
 * specific gate cannot silently record activity against another gate.
 */
const resolveOperationalGate = async ({
  gateId,
  buildingId,
  operation,
  assignedGateId = null,
  mongoSession = null,
  required = false,
}) => {
  const effectiveGateId = gateId || assignedGateId || null;
  if (!effectiveGateId) {
    if (required) throw new AppError(`${operation} gate is required`, 400, 'GATE_REQUIRED');
    return null;
  }
  if (!mongoose.Types.ObjectId.isValid(effectiveGateId)) {
    throw new AppError('Invalid gate', 400, 'INVALID_GATE');
  }
  if (assignedGateId && String(assignedGateId) !== String(effectiveGateId)) {
    throw new AppError('This staff shift is assigned to a different gate', 403, 'SHIFT_GATE_MISMATCH');
  }

  const query = Gate.findOne({ _id: effectiveGateId, building: buildingId, status: 'active' });
  if (mongoSession) query.session(mongoSession);
  const gate = await query;
  if (!gate) throw new AppError('Gate is unavailable for this building', 409, 'GATE_UNAVAILABLE');
  if (!directionAllows(gate.direction, operation)) {
    throw new AppError(`Gate does not allow ${operation} traffic`, 409, 'GATE_DIRECTION_MISMATCH');
  }
  return gate;
};

module.exports = { resolveOperationalGate };
