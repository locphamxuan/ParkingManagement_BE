const mongoose = require('mongoose');
const { Incident, ParkingSlot, ParkingSession, LongTermSubscription } = require('../../models');
const AppError = require('../../utils/AppError');
const generateBookingCode = require('../../utils/generateBookingCode');
const { normalizePlate } = require('../../utils/plate.util');
const { findPlateAccountInBuilding } = require('../shared/incidentResolve.service');

// Các loại sự cố user được phép báo cáo (khớp FE). 'other' cho phép mô tả tự do.
const USER_INCIDENT_TYPES = [
  'slot_occupied',      // Có người đậu vào slot của tôi (chiếm chỗ trái phép)
  'slot_blocked',       // Slot bị chắn/cản (vật cản, cọc, xe đậu đè vạch)
  'vehicle_damaged',    // Xe bị hư hại/trầy xước khi đang đậu
  'facility_issue',     // Tình trạng khu vực: ngập nước, mất đèn, hư nền, biển báo sai
  'wrong_scan',         // Quét nhầm biển số / sai thông tin phương tiện
  'payment_dispute',    // Tranh chấp phí/thanh toán
  'security',           // An ninh: nghi ngờ trộm cắp, người khả nghi
  'other',              // Khác (tự nhập)
];

const POPULATE_BUILDING = { path: 'building', select: '_id code name' };
const POPULATE_SLOT = { path: 'slot', select: '_id code' };

/**
 * User tạo phiếu sự cố. Building/slot được suy ra từ slotId (nếu có) hoặc từ
 * subscription/parking session đang hoạt động của user; cuối cùng mới tới buildingId.
 */
const createIncident = async (userId, payload = {}) => {
  const type = String(payload.type || '').trim();
  if (!type || !USER_INCIDENT_TYPES.includes(type)) {
    throw new AppError(`type must be one of: ${USER_INCIDENT_TYPES.join(', ')}`, 400, 'INVALID_INCIDENT_TYPE');
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

  // Sự cố an ninh / hư hại xe / chiếm chỗ → mức độ cao hơn.
  const highSeverity = ['slot_occupied', 'vehicle_damaged', 'security'].includes(type);

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
