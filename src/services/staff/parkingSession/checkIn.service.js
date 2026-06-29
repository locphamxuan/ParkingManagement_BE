const mongoose = require('mongoose');
const AppError = require('../../../utils/AppError');
const buildingRepository = require('../../../repositories/building.repository');
const {
  ParkingSession,
  ParkingSlot,
  User,
  StaffShift,
} = require('../../../models');
const { assertBuildingScope, logAudit } = require('../../../utils/staffScope');
const { normalizePlate, plateMatchRegex } = require('../../../utils/plate.util');
const {
  resolveVehicleTypeId,
  asObjectId,
  findDuplicateActiveSession,
  resolveLongTermSubscription,
  resolveReservation,
  resolveCustomerUsageType,
  acceptableUsageTypes,
  findCompatibleSlots,
  findCapacityForBuilding,
} = require('./helpers');

// Slot có hợp ĐỐI TƯỢNG của lượt check-in không (theo chuỗi fallback: hội viên/đặt
// chỗ dùng được slot chung walk_in, nhưng vãng lai không lấn slot hội viên).
// KHÔNG chặn theo loại xe: loại xe của phiên lấy thẳng từ slot/dãy (manager cấu hình),
// nên staff được tự do chọn dãy loại xe nào sau khi camera nhận diện.
const isSlotUsageCompatible = (slot, usageType) => {
  if (usageType && slot.usageType) {
    const chain = acceptableUsageTypes(usageType);
    if (chain.length && !chain.includes(slot.usageType)) return false;
  }
  return true;
};

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

      // Chỉ cần nhân viên có ca HÔM NAY là được check-in (không còn ràng buộc theo
      // HƯỚNG cổng của ca — gate.direction chỉ là cấu hình vật lý + gợi ý tab ở FE).
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
      const todayShifts = await StaffShift.find({
        staff: user._id,
        building: buildingId,
        workDate: { $gte: todayStart, $lte: todayEnd },
        status: { $in: ['active', 'scheduled'] },
      }).session(session);
      if (!todayShifts.length) {
        throw new AppError('You have not been assigned a shift today', 403, 'NO_SHIFT_ASSIGNED');
      }

      // Ảnh CHÂN DUNG bắt buộc cho MỌI check-in (kể cả gói/đặt chỗ) để đối chiếu
      // người khi lấy xe. Ảnh BIỂN SỐ bắt buộc thêm với khách vãng lai / user thường
      // (kiểm tra ở dưới); gói & đặt chỗ định danh bằng quét nên không bắt ảnh biển.
      if (!portraitImage) {
        throw new AppError('A driver portrait photo is required to verify the person at pickup', 400, 'PORTRAIT_REQUIRED');
      }

      // Nhận diện gói dài hạn sớm (qua biển số lấy từ QR phương tiện hoặc nhập tay).
      const longTerm = await resolveLongTermSubscription(plateNumber, allowedBuildings);

      // Gói floating: không còn slot cố định → mọi xe (kể cả gói) đều theo capacity.
      const { totalSlots, activeSessions } = await findCapacityForBuilding(buildingId);
      if (totalSlots > 0 && activeSessions >= totalSlots) {
        throw new AppError('Building is at capacity', 409);
      }

      const duplicate = await findDuplicateActiveSession(plateNumber, buildingId);
      if (duplicate && !forceCheckIn) {
        throw new AppError('Duplicate active plate detected', 400, 'DUPLICATE_PLATE_WARNING');
      }

      if (longTerm) {
        // Gói floating: gán 1 slot trống thuộc dãy "subscriber" + đúng loại xe.
        // Staff chọn → validate tương thích; không chọn → tự gợi ý slot phù hợp.
        let ltSlotId = asObjectId(payload?.slot || payload?.slotId);
        let ltSlot;
        if (ltSlotId) {
          ltSlot = await ParkingSlot.findById(ltSlotId).session(session);
          if (!ltSlot || (ltSlot.building && String(ltSlot.building) !== String(buildingId))) {
            throw new AppError('Invalid slot', 400, 'INVALID_SLOT');
          }
          if (ltSlot.status !== 'available') {
            throw new AppError('The slot is occupied or unavailable', 409, 'SLOT_NOT_AVAILABLE');
          }
          if (!forceCheckIn && !isSlotUsageCompatible(ltSlot, 'subscriber')) {
            throw new AppError('The slot is not in a zone for long-term packages', 409, 'SLOT_USAGE_MISMATCH');
          }
        } else {
          const [suggested] = await findCompatibleSlots(buildingId, vehicleType, 'subscriber', session);
          if (!suggested) {
            throw new AppError('No suitable slot available for the package vehicle', 409, 'SLOT_REQUIRED_FOR_LONG_TERM');
          }
          ltSlot = suggested;
          ltSlotId = suggested._id;
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
            // Loại xe của phiên lấy theo slot/dãy (manager cấu hình); camera chỉ là fallback.
            vehicleType: ltSlot.vehicleType || vehicleType,
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
        throw new AppError('A license plate photo is required to check in', 400, 'PLATE_IMAGE_REQUIRED');
      }

      // Đối tượng của lượt check-in (để khớp dãy/slot). Reservation → 'reserved',
      // có tài khoản → 'registered', còn lại → 'walk_in'.
      const usageType = resolveCustomerUsageType({ longTerm: null, reservation, registeredOwner });

      // Luồng KHÔNG phải reservation: tự gợi ý slot tương thích nếu staff chưa chọn.
      let selectedSlotId = asObjectId(payload?.slot);
      if (!reservation && !selectedSlotId) {
        const [suggested] = await findCompatibleSlots(buildingId, vehicleType, usageType, session);
        if (suggested) {
          selectedSlotId = suggested._id;
        } else {
          // Không còn slot đúng đối tượng — nếu tòa vẫn còn slot trống khác thì bắt
          // staff chọn tay (tránh tự gán bừa vào dãy sai đối tượng).
          const availableSlotCount = await ParkingSlot.countDocuments({
            building: buildingId,
            status: 'available',
          }).session(session);
          if (availableSlotCount > 0) {
            throw new AppError('Please select a parking slot before check-in', 400, 'SLOT_REQUIRED');
          }
        }
      }

      // Slot ưu tiên: reservation slot → slot đã chọn/gợi ý (walk-in/standard)
      const slotId = reservation?.slot?._id || reservation?.slot || selectedSlotId || null;
      // Loại xe của phiên sẽ lấy theo slot/dãy (manager cấu hình) khi có slot.
      let assignedSlotVehicleType = null;
      if (slotId) {
        const slot = await ParkingSlot.findById(slotId).session(session);
        if (slot?.status === 'maintenance') {
          throw new AppError('Assigned slot is under maintenance', 409, 'SLOT_MAINTENANCE_NOT_AVAILABLE');
        }
        if (slot?.status !== 'available' && !reservation) {
          throw new AppError('The slot is occupied or unavailable', 409, 'SLOT_NOT_AVAILABLE');
        }
        // Chỉ chặn theo ĐỐI TƯỢNG (reservation đã định sẵn slot nên bỏ qua). Loại xe do
        // dãy/slot quyết định nên không chặn — staff tự do chọn dãy loại xe nào.
        if (slot && !reservation && !forceCheckIn && !isSlotUsageCompatible(slot, usageType)) {
          throw new AppError('The slot is not in a zone for this usage class', 409, 'SLOT_USAGE_MISMATCH');
        }
        if (slot) {
          assignedSlotVehicleType = slot.vehicleType || null;
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
          // Ưu tiên loại xe của dãy/slot; fallback loại xe camera nhận diện.
          vehicleType: assignedSlotVehicleType || vehicleType,
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
