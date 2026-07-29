const mongoose = require('mongoose');
const AppError = require('../utils/AppError');
const {
  Building,
  LongTermSubscription,
  ParkingSession,
  ParkingSlot,
  User,
} = require('../models');
const { logAudit } = require('../utils/staffScope');
const { normalizePlate, plateMatchRegex } = require('../utils/plate.util');
const {
  activeSubscriptionMatch,
  findCompatibleSlots,
  isDuplicateActiveSessionError,
  duplicateActiveSessionError,
  loadVehicleKind,
  packageVehicleOf,
  assertPackageVehicleKind,
  POPULATE_PACKAGE_VEHICLE_TYPE,
} = require('./staff/parkingSession/helpers');
const { assertBuildingAcceptsEntry } = require('./shared/entryAuthorization.service');
const { occupyFixedSlotForCheckIn } = require('./shared/slotLifecycle.service');
const { resolveOperationalGate } = require('./shared/gateAuthorization.service');
const { assertEvidenceImage } = require('../utils/evidence');

/**
 * Resolve a REGISTERED vehicle QR token (PLT-...) to its canonical plate + owner.
 * Kiosk is unmanned, so it ONLY accepts a valid per-plate QR token — a bare plate
 * number is rejected (anyone could read a plate off a windshield). Drivers who
 * can't scan their QR must check in via a staff member instead.
 */
const resolvePlateFromQr = async ({ qrCode }) => {
  const token = `${qrCode || ''}`.trim();
  if (!token) {
    throw new AppError('Vui lòng quét mã QR phương tiện.', 400, 'KIOSK_QR_REQUIRED');
  }

  const owner = await User.findOne({ 'licensePlates.qrCode': token }).select('licensePlates');
  const plate = owner?.licensePlates?.find((p) => p.qrCode === token);
  if (!owner || !plate?.plateNumber) {
    throw new AppError(
      'Mã QR không hợp lệ hoặc chưa đăng ký. Vui lòng gặp nhân viên để check-in.',
      404,
      'KIOSK_QR_NOT_FOUND',
    );
  }

  const plateNumber = normalizePlate(plate.plateNumber);
  if (!plateNumber) {
    throw new AppError(
      'Biển số QR bị lỗi định dạng, vui lòng gặp nhân viên để check-in.',
      400,
      'KIOSK_INVALID_PLATE_FORMAT',
    );
  }
  return { plateNumber, user: owner._id };
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
        .populate(POPULATE_PACKAGE_VEHICLE_TYPE)
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

      // Gói floating: chỉ nhận ô đúng loại xe CỦA GÓI (hoặc ô "vạn năng"
      // vehicleType=null) — gói xe máy không được cấp ô ô tô và ngược lại.
      const { id: packageVehicleTypeId, kind: packageVehicleKind } = packageVehicleOf(subscription);

      let slot = null;
      if (subscription.slot) {
        slot = await occupyFixedSlotForCheckIn(subscription, buildingId, session);
        const slotVehicleKind = await loadVehicleKind(slot.vehicleType, session);
        assertPackageVehicleKind(
          packageVehicleKind,
          slotVehicleKind,
          `This fixed slot is configured for ${slotVehicleKind} vehicles but the long-term package covers ${packageVehicleKind} vehicles`,
        );
      } else {
        [slot] = await findCompatibleSlots(buildingId, packageVehicleTypeId, 'subscriber', session);
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
            vehicleType: packageVehicleTypeId || slot.vehicleType || null,
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
  } catch (error) {
    // Cùng bất biến với staff check-in: 1 biển = 1 phiên active / tòa (unique index).
    if (isDuplicateActiveSessionError(error)) throw duplicateActiveSessionError();
    throw error;
  } finally {
    session.endSession();
  }
};

module.exports = { selfCheckInByQr, resolvePlateFromQr };
