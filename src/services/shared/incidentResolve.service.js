const mongoose = require('mongoose');
const { Incident, ParkingSession, ParkingSlot, Payment, Notification } = require('../../models');
const AppError = require('../../utils/AppError');
const { normalizePlate, plateMatchRegex } = require('../../utils/plate.util');
const { writeAuditLog } = require('../../utils/audit');

const { INCIDENT_STATUS } = Incident;

const POPULATE_BUILDING = { path: 'building', select: '_id code name' };
const POPULATE_SLOT = { path: 'slot', select: '_id code' };
const POPULATE_REPORTER = { path: 'reportedBy', select: '_id fullName email' };
const POPULATE_RESOLVER = { path: 'resolvedBy', select: '_id fullName email' };

/**
 * Force-checkout PHƯƠNG TIỆN VI PHẠM đang đỗ trong tòa (biển khớp) — mô phỏng luồng
 * lost-ticket: kết thúc phiên, thu phí phạt (Payment), nhả slot. Trả về Payment (hoặc null
 * nếu không có phiên active nào khớp — vẫn cho phép resolve incident).
 */
const _forceCheckoutViolator = async (actorUser, buildingId, plate, penaltyFee, paymentMethod, mongoSession) => {
  const rx = plateMatchRegex(plate) || plate;
  const violatorSession = await ParkingSession.findOne({
    plateNumber: rx,
    building: buildingId,
    status: 'active',
  }).session(mongoSession);

  if (!violatorSession) return null;

  violatorSession.exitTime = new Date();
  violatorSession.status = 'completed';
  violatorSession.fee = penaltyFee;
  violatorSession.paymentMethod = paymentMethod;
  violatorSession.note = [violatorSession.note, 'violator_force_checkout'].filter(Boolean).join(' | ');
  await violatorSession.save({ session: mongoSession });

  const slotId = violatorSession.slot?._id || violatorSession.slot || null;
  if (slotId) {
    const slot = await ParkingSlot.findById(slotId).session(mongoSession);
    if (slot && slot.status !== 'maintenance') {
      slot.status = 'available';
      await slot.save({ session: mongoSession });
    }
  }

  const [payment] = await Payment.create([{
    building: buildingId,
    type: 'session',
    method: paymentMethod,
    amount: penaltyFee,
    status: paymentMethod === 'cash' ? 'pending' : 'success',
    parkingSession: violatorSession._id,
    user: violatorSession.user || null,
    staff: actorUser._id,
    note: 'Violator force checkout (incident)',
  }], { session: mongoSession });

  return payment;
};

/**
 * Áp một hành động xử lý sự cố (dùng chung cho staff & manager). Incident đã được
 * caller LOAD + KIỂM TRA phạm vi tòa nhà trước khi gọi.
 *
 * payload: { status?, resolutionNote?, violatorPlate?, action?, penaltyFee?, paymentMethod? }
 *   - action === 'penalize_violator' → force-checkout xe vi phạm + đặt incident 'resolved'.
 */
const applyIncidentAction = async (actorUser, incident, payload = {}) => {
  const before = incident.toObject();
  const mongoSession = await mongoose.startSession();
  try {
    let result;
    await mongoSession.withTransaction(async () => {
      const update = {};

      if (payload.violatorPlate !== undefined) {
        update.violatorPlate = normalizePlate(payload.violatorPlate) || '';
      }
      if (payload.resolutionNote !== undefined) {
        update.resolutionNote = String(payload.resolutionNote).trim();
      }

      let penaltyPayment = null;
      if (payload.action === 'penalize_violator') {
        const plate = normalizePlate(payload.violatorPlate || incident.violatorPlate);
        if (!plate) {
          throw new AppError('violatorPlate is required to penalize the offending vehicle', 400, 'VIOLATOR_PLATE_REQUIRED');
        }
        const penaltyFee = Number(payload.penaltyFee ?? 0);
        if (!Number.isFinite(penaltyFee) || penaltyFee < 0) {
          throw new AppError('penaltyFee must be a non-negative number', 400, 'INVALID_PENALTY_FEE');
        }
        penaltyPayment = await _forceCheckoutViolator(
          actorUser, incident.building, plate, penaltyFee, payload.paymentMethod || 'cash', mongoSession,
        );
        update.violatorPlate = plate;
        update.status = 'resolved';
      } else if (payload.status !== undefined) {
        if (!INCIDENT_STATUS.includes(payload.status)) {
          throw new AppError(`status must be one of: ${INCIDENT_STATUS.join(', ')}`, 400, 'INVALID_STATUS');
        }
        update.status = payload.status;
      }

      if (update.status === 'resolved' || update.status === 'closed') {
        update.resolvedBy = actorUser._id;
        update.resolvedAt = new Date();
      }

      const updated = await Incident.findByIdAndUpdate(incident._id, update, {
        new: true,
        runValidators: true,
        session: mongoSession,
      })
        .populate(POPULATE_BUILDING)
        .populate(POPULATE_SLOT)
        .populate(POPULATE_REPORTER)
        .populate(POPULATE_RESOLVER);

      // Thông báo cho người báo cáo về tiến triển / kết quả xử lý.
      const isDone = update.status === 'resolved' || update.status === 'closed';
      await Notification.create([{
        user: incident.reportedBy,
        type: isDone ? 'incident_resolved' : 'incident_update',
        title: isDone ? 'Your incident has been resolved' : 'Your incident is being handled',
        message: isDone
          ? `Incident ${incident.code} has been ${update.status}.${update.resolutionNote ? ` Note: ${update.resolutionNote}` : ''}`
          : `Incident ${incident.code} status: ${update.status || incident.status}.`,
        building: incident.building,
        isRead: false,
      }], { session: mongoSession });

      result = { item: updated, penaltyPayment };
    });

    await writeAuditLog({
      actor: actorUser,
      action: 'RESOLVE_INCIDENT',
      targetTable: 'incidents',
      targetId: `${incident._id}`,
      building: incident.building,
      previousValue: before,
      newValue: result.item.toObject(),
    });

    return result;
  } finally {
    mongoSession.endSession();
  }
};

module.exports = { applyIncidentAction };
