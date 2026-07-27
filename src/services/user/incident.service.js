const mongoose = require('mongoose');
const { Incident, ParkingSlot, ParkingSession, LongTermSubscription, ViolationType } = require('../../models');
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
 * User tạo phiếu sự cố. Building/slot được suy ra từ slotId (nếu có) hoặc từ
 * subscription/parking session đang hoạt động của user; cuối cùng mới tới buildingId.
 */
const createIncident = async (userId, payload = {}) => {
  const type = String(payload.type || '').trim();
  if (!type) {
    throw new AppError('type is required', 400, 'INVALID_INCIDENT_TYPE');
  }

  let buildingId = payload.buildingId && mongoose.isValidObjectId(payload.buildingId) ? payload.buildingId : null;
  let slotId = null;

  // Ưu tiên slot user chỉ định → lấy building từ slot.
  if (payload.slotId && mongoose.isValidObjectId(payload.slotId)) {
    const slot = await ParkingSlot.findById(payload.slotId).select('_id building');
    if (slot) {
      slotId = slot._id;
      buildingId = buildingId || slot.building;
    }
  }

  // Nếu vẫn chưa có building/slot → suy từ gói hoặc phiên đang hoạt động của user.
  if (!buildingId || !slotId) {
    const activeSub = await LongTermSubscription.findOne({ user: userId, status: 'active' })
      .sort('-updatedAt')
      .select('building slot');
    if (activeSub) {
      buildingId = buildingId || activeSub.building;
      slotId = slotId || activeSub.slot || null;
    }
  }
  if (!buildingId) {
    const activeSession = await ParkingSession.findOne({ user: userId, status: 'active' })
      .sort('-entryTime')
      .select('building slot');
    if (activeSession) {
      buildingId = buildingId || activeSession.building;
      slotId = slotId || activeSession.slot || null;
    }
  }

  if (!buildingId) {
    throw new AppError('Không xác định được tòa nhà của sự cố. Vui lòng chọn tòa nhà.', 400, 'BUILDING_REQUIRED');
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
  let plateAccountFound = null;
  let status = 'open';
  if (violatorPlate) {
    plateAccountFound = await findPlateAccountInBuilding(violatorPlate, buildingId);
    if (!plateAccountFound) status = 'escalated';
  }

  const incident = await Incident.create({
    code: generateBookingCode('INC'),
    type,
    target: String(payload.target || '').trim(),
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
