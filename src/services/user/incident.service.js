const mongoose = require('mongoose');
const { Incident, ParkingSlot, ParkingSession, ViolationType } = require('../../models');
const AppError = require('../../utils/AppError');
const generateBookingCode = require('../../utils/generateBookingCode');
const { normalizePlate } = require('../../utils/plate.util');
const { findPlateAccountInBuilding } = require('../shared/incidentResolve.service');

// Loại sự cố "tự thân" (không liên quan tới phạt 1 xe/biển số khác) — cố định
// trong code vì không gắn với bảng giá vi phạm của manager. 'other' dùng chung
// cho cả nhóm này lẫn nhóm "báo cáo vi phạm" bên dưới.
const USER_INCIDENT_TYPES = [
  'vehicle_damaged',    // Xe bị hư hại/trầy xước khi đang đậu
  'facility_issue',     // Tình trạng khu vực: ngập nước, mất đèn, hư nền, biển báo sai
  'wrong_scan',         // Quét nhầm biển số / sai thông tin phương tiện
  'payment_dispute',    // Tranh chấp phí/thanh toán
  'security',           // An ninh: nghi ngờ trộm cắp, người khả nghi
  'other',              // Khác (tự nhập) — cũng dùng khi báo vi phạm không khớp loại nào trong bảng giá
];

const POPULATE_BUILDING = { path: 'building', select: '_id code name' };
const POPULATE_SLOT = { path: 'slot', select: '_id code' };

/**
 * User tạo phiếu sự cố.
 *
 * Điều kiện tiên quyết: người báo cáo phải ĐANG có xe đỗ trong bãi. Trước đây một
 * phiên đã hoàn tất hoặc một gói còn hiệu lực là đủ, nhưng như vậy người dùng có
 * thể mở phiếu cho tòa nhà mình không hề có mặt — staff không thể ra kiểm chứng
 * tại chỗ, và vụ vi phạm đã trôi qua từ lâu. Building/slot vì thế được suy ra từ
 * chính phiên đang đỗ, không lấy theo ý client.
 */
const createIncident = async (userId, payload = {}) => {
  const type = String(payload.type || '').trim();
  if (!type) {
    throw new AppError('type is required', 400, 'INVALID_INCIDENT_TYPE');
  }

  const requestedBuildingId = payload.buildingId && mongoose.isValidObjectId(payload.buildingId)
    ? payload.buildingId
    : null;
  if (payload.buildingId && !requestedBuildingId) {
    throw new AppError('buildingId không hợp lệ', 400, 'INVALID_BUILDING');
  }
  if (payload.slotId && !mongoose.isValidObjectId(payload.slotId)) {
    throw new AppError('slotId không hợp lệ', 400, 'INVALID_SLOT');
  }
  if (payload.sessionId && !mongoose.isValidObjectId(payload.sessionId)) {
    throw new AppError('sessionId không hợp lệ', 400, 'INVALID_SESSION');
  }

  // ── Phải đang đỗ xe thì mới được báo sự cố ──────────────────────────────────
  const activeSessions = await ParkingSession.find({ user: userId, status: 'active' })
    .sort('-entryTime')
    .select('building slot plateNumber');

  if (activeSessions.length === 0) {
    throw new AppError(
      'Bạn chỉ có thể báo cáo sự cố khi xe đang đỗ trong bãi.',
      409,
      'ACTIVE_SESSION_REQUIRED',
    );
  }

  // Nhiều xe cùng đỗ → client chỉ được chọn trong đúng các phiên của mình.
  let session = null;
  if (payload.sessionId) {
    session = activeSessions.find((item) => `${item._id}` === `${payload.sessionId}`) || null;
    if (!session) {
      throw new AppError(
        'Phiên gửi xe không tồn tại hoặc đã kết thúc.',
        409,
        'ACTIVE_SESSION_REQUIRED',
      );
    }
  } else if (requestedBuildingId) {
    session = activeSessions.find((item) => `${item.building}` === `${requestedBuildingId}`) || null;
    if (!session) {
      throw new AppError(
        'Bạn không có xe nào đang đỗ tại tòa nhà này nên không thể báo cáo sự cố ở đây.',
        403,
        'BUILDING_RELATION_REQUIRED',
      );
    }
  } else {
    session = activeSessions[0];
  }

  const buildingId = session.building;

  // Slot phải THUỘC ĐÚNG tòa nhà đã xác thực — nếu không, sự cố trỏ sang ô của tòa khác.
  let slotId = session.slot || null;
  if (payload.slotId) {
    const slot = await ParkingSlot.findOne({ _id: payload.slotId, building: buildingId }).select('_id');
    if (!slot) {
      throw new AppError(
        'Ô đỗ không thuộc tòa nhà của sự cố',
        409,
        'SLOT_BUILDING_MISMATCH',
      );
    }
    slotId = slot._id;
  }

  // 'type' hợp lệ nếu thuộc nhóm cố định (sự cố tự thân) HOẶC khớp 1 violation type
  // đang active manager đã cấu hình cho building này (bảng giá vi phạm — không hard
  // code trong code, do manager tự thêm/sửa/xoá).
  const isFixedType = USER_INCIDENT_TYPES.includes(type);
  let matchedViolationType = null;
  if (!isFixedType) {
    matchedViolationType = await ViolationType.findOne({ building: buildingId, code: type, isActive: true });
    if (!matchedViolationType) {
      throw new AppError(
        `type must be one of: ${USER_INCIDENT_TYPES.join(', ')}, or a configured violation type for this building`,
        400,
        'INVALID_INCIDENT_TYPE',
      );
    }
  }

  // Sự cố an ninh / hư hại xe / báo cáo vi phạm (bảng giá) → mức độ cao hơn.
  const highSeverity = ['vehicle_damaged', 'security'].includes(type) || Boolean(matchedViolationType);

  // Biển số vi phạm (case "có người đậu vào slot của tôi") → tự tra cứu xem đã có
  // account (subscription/phiên gắn user) trong building chưa. Không tìm thấy →
  // tự động escalate cho manager xử lý (staff chỉ xem, không đủ thẩm quyền).
  const violatorPlate = normalizePlate(payload.violatorPlate || '') || '';
  if (violatorPlate && violatorPlate === normalizePlate(session.plateNumber || '')) {
    throw new AppError(
      'Biển số vi phạm không thể là biển số xe của chính bạn.',
      400,
      'SELF_REPORTED_PLATE',
    );
  }

  let plateAccountFound = null;
  let status = 'open';
  if (violatorPlate) {
    plateAccountFound = await findPlateAccountInBuilding(violatorPlate, buildingId);
    if (!plateAccountFound) status = 'escalated';
  }

  const incident = await Incident.create({
    code: generateBookingCode('INC'),
    type,
    // Không khai target → dùng biển số đang đỗ, để staff biết ngay phiếu này thuộc xe nào.
    target: String(payload.target || '').trim() || String(session.plateNumber || '').trim(),
    note: String(payload.note || payload.description || '').trim(),
    building: buildingId,
    slot: slotId,
    violatorPlate,
    plateAccountFound,
    severity: highSeverity ? 'high' : 'medium',
    status,
    reportedBy: userId,
  });

  await incident.populate([POPULATE_BUILDING, POPULATE_SLOT]);
  return { item: incident };
};

/**
 * Danh sách sự cố do CHÍNH user báo cáo.
 */
const listMyIncidents = async (userId, query = {}) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const filter = { reportedBy: userId };
  if (query.status) filter.status = query.status;

  const [items, total] = await Promise.all([
    Incident.find(filter)
      .populate(POPULATE_BUILDING)
      .populate(POPULATE_SLOT)
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Incident.countDocuments(filter),
  ]);

  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

module.exports = { createIncident, listMyIncidents, USER_INCIDENT_TYPES };
