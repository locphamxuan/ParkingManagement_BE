const mongoose = require('mongoose');
const AppError = require('../../utils/AppError');
const { Incident, ParkingSession } = require('../../models');
const { assertBuildingScope, logAudit } = require('../../utils/staffScope');
const generateBookingCode = require('../../utils/generateBookingCode');
const { applyIncidentAction } = require('../shared/incidentResolve.service');

// ─── helpers ────────────────────────────────────────────────────────────────

const POPULATE_BUILDING = { path: 'building',    select: '_id code name' };
const POPULATE_REPORTER = { path: 'reportedBy',  select: '_id fullName email' };

const toIdStr = (v) => `${v?._id || v}`;

/** Building IDs mà staff được gán */
const getAssignedIds = (user) =>
  Array.isArray(user?.assignedBuildings)
    ? user.assignedBuildings.map(toIdStr)
    : [];

// ─── createIncident ──────────────────────────────────────────────────────────

/**
 * Tạo phiếu sự cố mới.
 *
 * Payload từ FE: { type, target?, note?, buildingId?, severity? }
 * Payload backward-compat: { incidentType }
 */
const createIncident = async (staffUser, payload = {}) => {
  const type = String(payload.type || payload.incidentType || '').trim();
  if (!type) {
    throw new AppError('type is required', 400, 'INCIDENT_TYPE_REQUIRED');
  }

  let buildingId = payload.buildingId || null;
  if (buildingId) {
    assertBuildingScope(staffUser, buildingId);
  }

  // Phiên gửi xe gắn kèm phải THUỘC ĐÚNG tòa nhà của phiếu sự cố — nếu chỉ load theo
  // `_id`, staff tòa A gắn được phiên của tòa B vào sự cố tòa A. Building/slot lấy từ
  // chính phiên đã xác thực (server-derived) thay vì tin dữ liệu client gửi lên.
  let parkingSessionId = null;
  let slotId = null;
  if (payload.parkingSessionId) {
    if (!mongoose.Types.ObjectId.isValid(payload.parkingSessionId)) {
      throw new AppError('parkingSessionId is not a valid id', 400, 'INVALID_PARKING_SESSION');
    }
    if (!buildingId) {
      throw new AppError(
        'buildingId is required when a parking session is attached',
        400,
        'BUILDING_REQUIRED',
      );
    }
    const parkingSession = await ParkingSession.findOne({
      _id: payload.parkingSessionId,
      building: buildingId,
    }).select('_id building slot');
    if (!parkingSession) {
      throw new AppError(
        'Parking session not found in this building',
        409,
        'PARKING_SESSION_BUILDING_MISMATCH',
      );
    }
    parkingSessionId = parkingSession._id;
    buildingId = parkingSession.building;
    slotId = parkingSession.slot || null;
  }

  // ── Tạo sự cố thông thường ───────────────────────────────────────────────
  const code = generateBookingCode('INC');

  const incident = await Incident.create({
    code,
    type,
    target:         String(payload.target || '').trim(),
    note:           String(payload.note || payload.description || '').trim(),
    building:       buildingId,
    severity:       payload.severity || 'medium',
    status:         payload.status || 'open',
    reportedBy:     staffUser._id,
    resolvedBy:     payload.status === 'resolved' ? staffUser._id : null,
    resolvedAt:     payload.status === 'resolved' ? new Date() : null,
    resolutionNote: payload.status === 'resolved' ? String(payload.resolutionNote || payload.note || '').trim() : undefined,
    parkingSession: parkingSessionId,
    slot: slotId,
  });

  // Fix #5: chụp snapshot TRƯỚC populate để audit log lưu ID thuần
  const auditSnapshot = incident.toObject();

  await incident.populate([POPULATE_BUILDING, POPULATE_REPORTER]);

  await logAudit(null, {
    actor:       staffUser._id,
    action:      'INCIDENT_REPORTED',
    entityType:  'Incident',
    entityId:    `${incident._id}`,
    building:    buildingId,
    after:       auditSnapshot,          // ← ID thuần, không lồng object
    severity:    auditSnapshot.severity,
    description: `Incident reported: ${type}`,
  });

  return { item: incident };
};

// ─── listIncidents ───────────────────────────────────────────────────────────

/**
 * Liệt kê sự cố trong phạm vi building của staff.
 * Query: buildingId?, status?, severity?, page?, limit?
 */
const listIncidents = async (staffUser, query = {}) => {
  const { buildingId, status, severity } = query;
  const page  = Math.max(1, Number.parseInt(query.page,  10) || 1);
  const limit = Math.min(100, Number.parseInt(query.limit, 10) || 20);
  const skip  = (page - 1) * limit;

  // Fix #4: an toàn khi cast ObjectId
  const safeObjectId = (id) => {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new AppError(`buildingId không hợp lệ: ${id}`, 400, 'INVALID_BUILDING_ID');
    }
    return new mongoose.Types.ObjectId(id);
  };

  let buildingFilter = {};

  if (buildingId) {
    assertBuildingScope(staffUser, buildingId);
    buildingFilter = { building: safeObjectId(buildingId) };
  } else {
    const assignedIds = getAssignedIds(staffUser);
    // Fix #1: staff không có building → trả mảng rỗng, KHÔNG query toàn bảng
    if (assignedIds.length === 0) {
      return { items: [], meta: { total: 0, page, limit, totalPages: 0 } };
    }
    buildingFilter = { building: { $in: assignedIds.map(safeObjectId) } };
  }

  const filter = { ...buildingFilter };
  if (status)   filter.status   = status;
  if (severity) filter.severity = severity;

  const [items, total] = await Promise.all([
    Incident.find(filter)
      .populate(POPULATE_BUILDING)
      .populate(POPULATE_REPORTER)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Incident.countDocuments(filter),
  ]);

  return {
    items,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};

// ─── updateIncident ──────────────────────────────────────────────────────────

/**
 * Staff xử lý sự cố: đổi trạng thái / ghi chú xử lý / xử lý người vi phạm.
 * payload: { status?, resolutionNote?, violatorPlate?, action?, penaltyFee?, paymentMethod? }
 */
const updateIncident = async (staffUser, id, payload = {}) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError('Invalid incident id', 400, 'INVALID_INCIDENT_ID');
  }
  const incident = await Incident.findById(id);
  if (!incident) throw new AppError('Incident not found', 404, 'INCIDENT_NOT_FOUND');

  assertBuildingScope(staffUser, incident.building);

  return applyIncidentAction(staffUser, incident, payload);
};

module.exports = { createIncident, listIncidents, updateIncident };
