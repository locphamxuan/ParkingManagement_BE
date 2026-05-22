const mongoose = require('mongoose');
const AppError = require('../../utils/AppError');
const {
  ParkingSession,
  ParkingSlot,
  Payment,
  AuditLog,
  User,
} = require('../../models');

const logAudit = async (session, payload) =>
  AuditLog.create([
    {
      actor: payload.actor,
      actorRole: payload.actorRole || null,
      action: payload.action,
      targetTable: payload.entityType,
      targetId: payload.entityId || null,
      building: payload.building || null,
      previousValue: payload.before || null,
      newValue: payload.after || null,
      severity: payload.severity || 'low',
      description: payload.description || '',
    },
  ], { session });

const createIncidentReport = async (staffUser, payload = {}) => {
  const session = await mongoose.startSession();
  try {
    const result = await session.withTransaction(async () => {
      const incidentType = `${payload.incidentType || ''}`.trim();
      if (!incidentType) {
        throw new AppError('incidentType is required', 400, 'INCIDENT_TYPE_REQUIRED');
      }

      const parkingSessionId = payload.parkingSessionId || null;
      const report = {
        incidentType,
        description: payload.description || '',
        parkingSessionId,
        status: 'open',
        createdAt: new Date(),
      };

      let parkingSession = null;
      if (parkingSessionId) {
        parkingSession = await ParkingSession.findById(parkingSessionId).session(session);
        if (!parkingSession) {
          throw new AppError('Parking session not found', 404, 'SESSION_NOT_FOUND');
        }
      }

      if (incidentType.toLowerCase() === 'lost ticket') {
        if (!parkingSession) {
          throw new AppError('parkingSessionId is required for Lost Ticket incidents', 400, 'SESSION_ID_REQUIRED');
        }

        const penaltyFee = Number(payload.penaltyFee ?? payload.fixedPenaltyFee ?? 0);
        if (!Number.isFinite(penaltyFee) || penaltyFee < 0) {
          throw new AppError('penaltyFee must be a non-negative number', 400, 'INVALID_PENALTY_FEE');
        }

        const user = parkingSession.user
          ? await User.findById(parkingSession.user).session(session)
          : null;

        const previousSessionValue = parkingSession.toObject();
        parkingSession.exitTime = new Date();
        parkingSession.status = 'completed';
        parkingSession.fee = penaltyFee;
        parkingSession.paymentMethod = payload.paymentMethod || 'cash';
        parkingSession.note = [parkingSession.note, 'lost_ticket_manual_checkout']
          .filter(Boolean)
          .join(' | ');
        await parkingSession.save({ session });

        const slotId = parkingSession.slot?._id || parkingSession.slot || null;
        if (slotId) {
          const slot = await ParkingSlot.findById(slotId).session(session);
          if (slot && slot.status !== 'maintenance') {
            slot.status = 'available';
            await slot.save({ session });
          }
        }

        const payment = await Payment.create([
          {
            building: parkingSession.building,
            type: 'session',
            method: payload.paymentMethod || 'cash',
            amount: penaltyFee,
            status: 'success',
            parkingSession: parkingSession._id,
            user: user?._id || null,
            staff: staffUser._id,
            note: 'Lost Ticket manual checkout',
          },
        ], { session });

        await logAudit(session, {
          actor: staffUser._id,
          action: 'FORCE_VEHICLE_CHECKOUT',
          entityType: 'ParkingSession',
          entityId: `${parkingSession._id}`,
          building: parkingSession.building,
          before: previousSessionValue,
          after: parkingSession.toObject(),
          severity: 'critical',
          description: 'Lost Ticket forced checkout with fixed penalty fee',
        });

        return {
          report,
          parkingSession,
          payment: payment[0],
        };
      }

      await logAudit(session, {
        actor: staffUser._id,
        action: 'INCIDENT_REPORTED',
        entityType: 'Incident',
        entityId: null,
        building: parkingSession?.building || null,
        after: report,
        severity: 'medium',
        description: report.description || 'Staff incident report created',
      });

      return { report };
    });

    return result;
  } finally {
    session.endSession();
  }
};

module.exports = { createIncidentReport };
