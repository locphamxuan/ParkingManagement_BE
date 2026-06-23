const mongoose = require('mongoose');
const AppError = require('../../../utils/AppError');
const buildingRepository = require('../../../repositories/building.repository');
const {
  ParkingSession,
  ParkingSlot,
  User,
} = require('../../../models');
const { assertBuildingScope, logAudit } = require('../../../utils/staffScope');
const { normalizePlate, plateMatchRegex } = require('../../../utils/plate.util');
const {
  resolveVehicleTypeId,
  asObjectId,
  findDuplicateActiveSession,
  resolveLongTermSubscription,
  resolveReservation,
  findCapacityForBuilding,
} = require('./helpers');

const checkIn = async (user, payload) => {
  const session = await mongoose.startSession();
  try {
    const result = await session.withTransaction(async () => {
      const buildingId = payload?.building;
      const plateNumber = normalizePlate(payload?.plateNumber);
      // FE sends 'car'/'motorcycle'; resolve to the building's VehicleType _id so
      // pricing (by vehicle type) and reporting work. Falls back to null if unset.
      const vehicleType = await resolveVehicleTypeId(buildingId, payload?.vehicleType, session);
      const gate = asObjectId(payload?.gate);
      const forceCheckIn = Boolean(payload?.forceCheckIn);
      const vehicleBrand = payload?.vehicleBrand
        ? `${payload.vehicleBrand}`.trim()
        : null;
      // FE có 3 camera RIÊNG BIỆT:
      //  1) Camera chân dung → portraitImage (tài xế) — BẮT BUỘC mọi check-in.
      //  2) Camera biển số   → plateImage.
      //  3) Camera QR account/phương tiện → resolve qua endpoint riêng (không lưu ảnh).
      const plateImage = payload?.plateImage || null;
      const portraitImage = payload?.portraitImage || null;

      if (!buildingId) {
        throw new AppError('building is required', 400);
      }
      if (!plateNumber) {
        throw new AppError('plateNumber is required', 400);
      }

      const allowedBuildings = assertBuildingScope(user, buildingId);
      const building = await buildingRepository.findById(buildingId);
      if (!building) {
        throw new AppError('Building not found', 404);
      }

      // Ảnh CHÂN DUNG bắt buộc cho MỌI check-in (kể cả gói/đặt chỗ) để đối chiếu
      // người khi lấy xe. Ảnh BIỂN SỐ bắt buộc thêm với khách vãng lai / user thường
      // (kiểm tra ở dưới); gói & đặt chỗ định danh bằng quét nên không bắt ảnh biển.
      if (!portraitImage) {
        throw new AppError('Cần ảnh chân dung tài xế để đối chiếu khi lấy xe', 400, 'PORTRAIT_REQUIRED');
      }

      // Nhận diện gói dài hạn sớm (qua biển số lấy từ QR phương tiện hoặc nhập tay).
      const longTerm = await resolveLongTermSubscription(plateNumber, allowedBuildings);

      // Gói floating: không còn slot cố định → mọi xe (kể cả gói) đều theo capacity.
      const { totalSlots, activeSessions } = await findCapacityForBuilding(buildingId);
      if (totalSlots > 0 && activeSessions >= totalSlots) {
        throw new AppError('Building is at capacity', 409);
      }

      const duplicate = await findDuplicateActiveSession(plateNumber);
      if (duplicate && !forceCheckIn) {
        throw new AppError('Duplicate active plate detected', 400, 'DUPLICATE_PLATE_WARNING');
      }

      if (longTerm) {
        // Gói floating: staff PHẢI chọn 1 slot trống để gán cho xe (slot → occupied).
        const ltSlotId = asObjectId(payload?.slot || payload?.slotId);
        if (!ltSlotId) {
          throw new AppError('Cần chọn chỗ đỗ trống cho xe mua gói', 400, 'SLOT_REQUIRED_FOR_LONG_TERM');
        }
        const ltSlot = await ParkingSlot.findById(ltSlotId).session(session);
        if (!ltSlot || (ltSlot.building && String(ltSlot.building) !== String(buildingId))) {
          throw new AppError('Chỗ đỗ không hợp lệ', 400, 'INVALID_SLOT');
        }
        if (ltSlot.status !== 'available') {
          throw new AppError('Chỗ đỗ đã có xe hoặc không khả dụng', 409, 'SLOT_NOT_AVAILABLE');
        }
        ltSlot.status = 'occupied';
        await ltSlot.save({ session });

        const created = await ParkingSession.create(
          [{
            plateNumber,
            building: buildingId,
            staff: user._id,
            user: longTerm.user,
            fee: 0,
            paymentMethod: 'long_term',
            vehicleType,
            vehicleBrand,
            plateImage,
            portraitImage,
            entryGate: gate,
            slot: ltSlotId,
            note: `long_term:${longTerm._id}`,
          }],
          { session },
        );

        await logAudit(session, {
          actor: user._id,
          action: 'LONG_TERM_SUBSCRIPTION_CHECK_IN',
          entityType: 'ParkingSession',
          entityId: `${created[0]._id}`,
          building: buildingId,
          after: created[0].toObject(),
          metadata: { plateNumber, longTermSubscriptionId: `${longTerm._id}` },
        });

        return created[0];
      }

      const reservation = await resolveReservation(plateNumber, allowedBuildings);

      // Link the session to the plate's owner account when one exists (account is
      // the secondary identifier). Format-tolerant so 59G2-03880 / 59G2-038.80 match.
      const registeredOwner = await User.findOne({
        'licensePlates.plateNumber': plateMatchRegex(plateNumber) || plateNumber,
      })
        .select('_id')
        .session(session);

      // Không phải gói (đã return ở trên) và KHÔNG có đặt chỗ → khách vãng lai hoặc
      // user thường check-in trực tiếp: BẮT BUỘC thêm ảnh biển số (chân dung đã bắt
      // buộc ở trên). Đặt chỗ định danh bằng quét nên không bắt ảnh biển.
      if (!reservation && !plateImage) {
        throw new AppError('Cần ảnh biển số xe để check-in', 400, 'PLATE_IMAGE_REQUIRED');
      }

      // Bắt buộc chọn ô đỗ với luồng không phải reservation khi tòa nhà có slot.
      if (!reservation && !asObjectId(payload?.slot)) {
        const availableSlotCount = await ParkingSlot.countDocuments({
          building: buildingId,
          status: 'available',
        });
        if (availableSlotCount > 0) {
          throw new AppError('Cần chọn ô đỗ xe trước khi check-in', 400, 'SLOT_REQUIRED');
        }
      }

      // Slot ưu tiên: reservation slot → staff-selected slot (walk-in/standard)
      const slotId = reservation?.slot?._id || reservation?.slot || asObjectId(payload?.slot) || null;
      if (slotId) {
        const slot = await ParkingSlot.findById(slotId).session(session);
        if (slot?.status === 'maintenance') {
          throw new AppError('Assigned slot is under maintenance', 409, 'SLOT_MAINTENANCE_NOT_AVAILABLE');
        }
        if (slot?.status !== 'available' && !reservation) {
          throw new AppError('Chỗ đỗ đã có xe hoặc không khả dụng', 409, 'SLOT_NOT_AVAILABLE');
        }
        if (slot) {
          slot.status = 'occupied';
          await slot.save({ session });
        }
      }
      // Luôn đánh dấu reservation đã check-in khi có lượt match — KỂ CẢ lượt không
      // có slot — để không bị check-in lại lần 2 và không bị job auto-expire đụng tới.
      if (reservation) {
        reservation.status = 'checked_in';
        reservation.checkedInAt = new Date();
        await reservation.save({ session });
      }

      const created = await ParkingSession.create(
        [{
          plateNumber,
          building: buildingId,
          staff: user._id,
          user: reservation?.user || registeredOwner?._id || null,
          reservation: reservation?._id || null,
          slot: slotId,
          vehicleType,
          vehicleBrand,
          plateImage,
          portraitImage,
          entryGate: gate,
          note: reservation
            ? 'reservation_check_in'
            : duplicate && forceCheckIn
              ? 'duplicate_bypassed'
              : '',
        }],
        { session },
      );

      await logAudit(session, {
        actor: user._id,
        action: duplicate && forceCheckIn
          ? 'DUPLICATE_PLATE_BYPASS'
          : reservation
            ? 'RESERVATION_CHECK_IN'
            : 'PARKING_SESSION_CHECK_IN',
        entityType: 'ParkingSession',
        entityId: `${created[0]._id}`,
        building: buildingId,
        after: created[0].toObject(),
        metadata: {
          plateNumber,
          duplicatePlateWarning: Boolean(duplicate),
          forceCheckIn,
          reservationId: reservation ? `${reservation._id}` : null,
        },
      });

      return created[0];
    });

    return result;
  } finally {
    session.endSession();
  }
};

module.exports = { checkIn };
