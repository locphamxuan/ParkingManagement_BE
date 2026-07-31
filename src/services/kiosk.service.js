const mongoose = require('mongoose');
const AppError = require('../utils/AppError');
const {
  Building,
  LongTermSubscription,
  ParkingSession,
  ParkingSlot,
} = require('../models');
const { resolveScannedQr } = require('./user/vehicleQr.service');
const { logAudit } = require('../utils/staffScope');
const { normalizePlate, plateMatchRegex } = require('../utils/plate.util');
const {
  activeSubscriptionMatch,
  findCompatibleSlots,
} = require('./staff/parkingSession/helpers');
const { assertBuildingAcceptsEntry } = require('./shared/entryAuthorization.service');
const { occupyFixedSlotForCheckIn } = require('./shared/slotLifecycle.service');
const { resolveOperationalGate } = require('./shared/gateAuthorization.service');
const { assertEvidenceImage } = require('../utils/evidence');

/**
 * Đổi mã QR phương tiện (PLT-...) thành biển số chuẩn + chủ xe.
 * Kiosk không có người trực nên CHỈ chấp nhận mã QR hợp lệ và CÒN HẠN — nhập tay biển
 * số thì ai đọc biển trên kính xe cũng check-in được. Mã hết hạn/không tồn tại đều bị
 * `resolveScannedQr` từ chối kèm mã lỗi riêng để kiosk hiện đúng hướng dẫn cho khách.
 */
const resolvePlateFromQr = async ({ qrCode }) => {
  const vehicle = await resolveScannedQr(qrCode);

  const plateNumber = normalizePlate(vehicle.plateNumber);
  if (!plateNumber) {
    throw new AppError(
      'Biển số QR bị lỗi định dạng, vui lòng gặp nhân viên để check-in.',
      400,
      'KIOSK_INVALID_PLATE_FORMAT',
    );
  }
  return { plateNumber, user: vehicle.owner };
};

/**
 * selfCheckInByQr
 * Kiosk self check-in cho khách có GÓI DÀI HẠN. Quét QR phương tiện → tìm gói còn
 * hiệu lực cho biển số → nhận xe tự động (ưu tiên slot cố định của gói, nếu không có
 * thì gán 1 slot trống thuộc dãy 'subscriber'). Không cần nhân viên. Lưu ảnh camera
 * (biển + chân dung) làm bằng chứng. Khách không có gói phải check-in qua nhân viên.
 */
const selfCheckInByQr = async (payload = {}) => {
  const { plateNumber, user: qrOwnerId } = await resolvePlateFromQr(payload);
  const plateRx = plateMatchRegex(plateNumber) || plateNumber;
  const plateImage = assertEvidenceImage(payload.plateImage, 'plateImage');
  const portraitImage = assertEvidenceImage(payload.portraitImage, 'portraitImage');

  const session = await mongoose.startSession();
  try {
    const result = await session.withTransaction(async () => {
      const subFilter = {
        plateNumber: plateRx,
        user: qrOwnerId,
        ...activeSubscriptionMatch(),
      };
      if (payload.building) subFilter.building = payload.building;

      const subscription = await LongTermSubscription.findOne(subFilter)
        .sort({ updatedAt: -1 })
        .populate('slot')
        .session(session);

      if (!subscription) {
        throw new AppError(
          'Không tìm thấy gói dài hạn hợp lệ cho phương tiện này. Vui lòng liên hệ nhân viên.',
          404,
          'SUBSCRIPTION_NOT_FOUND',
        );
      }

      const buildingId = subscription.building;
      const building = await Building.findById(buildingId).session(session);
      if (!building) {
        throw new AppError('Building not found', 404, 'BUILDING_NOT_FOUND');
      }
      assertBuildingAcceptsEntry(building);
      const entryGate = await resolveOperationalGate({
        gateId: payload.gate || payload.entryGate || null,
        buildingId,
        operation: 'in',
        mongoSession: session,
        required: true,
      });

      // Chặn trùng: xe đang có phiên active trong tòa này.
      const duplicate = await ParkingSession.findOne({
        plateNumber: plateRx,
        building: buildingId,
        status: 'active',
      }).session(session);
      if (duplicate) {
        throw new AppError('Phương tiện đang có phiên gửi xe trong bãi.', 409, 'DUPLICATE_PLATE');
      }

      let slot = null;
      if (subscription.slot) {
        slot = await occupyFixedSlotForCheckIn(subscription, buildingId, session);
      } else {
        [slot] = await findCompatibleSlots(buildingId, null, 'subscriber', session);
      }
      if (!slot) {
        throw new AppError(
          'Hiện không còn ô đỗ trống cho gói. Vui lòng liên hệ nhân viên.',
          409,
          'NO_SLOT_AVAILABLE',
        );
      }

      if (!subscription.slot) {
        const occupied = await ParkingSlot.findOneAndUpdate(
          { _id: slot._id, status: 'available' },
          { $set: { status: 'occupied' } },
          { new: true, session },
        );
        if (!occupied) {
          throw new AppError(
            'The selected slot is no longer available',
            409,
            'NO_SLOT_AVAILABLE',
          );
        }
        slot = occupied;
      }

      const created = await ParkingSession.create(
        [
          {
            building: buildingId,
            slot: slot._id,
            vehicleType: slot.vehicleType || null,
            plateNumber: subscription.plateNumber,
            user: subscription.user,
            staff: null,
            entryGate: entryGate._id,
            fee: 0,
            paymentMethod: 'long_term',
            status: 'active',
            plateImage,
            portraitImage,
            note: `long_term:${subscription._id} | kiosk_self_check_in`,
          },
        ],
        { session },
      );

      await logAudit(session, {
        actor: subscription.user,
        action: 'LONG_TERM_SELF_CHECK_IN',
        entityType: 'ParkingSession',
        entityId: `${created[0]._id}`,
        building: buildingId,
        after: created[0].toObject(),
        severity: 'low',
        description: `Long-term subscription ${subscription._id} self check-in via kiosk QR`,
        metadata: { kiosk: true, gateId: `${entryGate._id}` },
      });

      return { subscription, parkingSession: created[0] };
    });

    return result;
  } finally {
    session.endSession();
  }
};

module.exports = { selfCheckInByQr, resolvePlateFromQr };
