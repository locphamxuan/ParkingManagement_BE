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

      // Validate giờ hoạt động của tòa nhà
      if (building.operatingHours?.open && building.operatingHours?.close) {
        const now = new Date();
        const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        if (hhmm < building.operatingHours.open || hhmm >= building.operatingHours.close) {
          throw new AppError(
            `Tòa nhà ngoài giờ hoạt động (${building.operatingHours.open}–${building.operatingHours.close})`,
            400,
            'BUILDING_CLOSED',
          );
        }
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

      // Ảnh CHÂN DUNG bắt buộc cho MỌI check-in (kể cả gói) để đối chiếu người khi lấy
      // xe. Ảnh BIỂN SỐ bắt buộc thêm với khách vãng lai / user thường (kiểm tra ở
      // dưới); gói định danh bằng quét biển/QR nên không bắt ảnh biển.
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
        let ltSlot;
        let ltSlotId;
        let ltSlotUsageBypassed = false;

        // Ưu tiên SLOT CỐ ĐỊNH của gói (nếu user đã chọn lúc mua): ô đang giữ chỗ
        // 'reserved' → chuyển 'occupied'. Nếu bị chiếm ('occupied') thì báo lỗi để
        // staff xử lý (user có thể báo sự cố).
        const fixedSlotId = longTerm.slot?._id || longTerm.slot || null;
        if (fixedSlotId) {
          ltSlot = await ParkingSlot.findById(fixedSlotId).session(session);
          if (!ltSlot) {
            throw new AppError('Invalid slot', 400, 'INVALID_SLOT');
          }
          if (ltSlot.status === 'maintenance') {
            throw new AppError('Assigned slot is under maintenance', 409, 'SLOT_MAINTENANCE_NOT_AVAILABLE');
          }
          if (ltSlot.status === 'occupied') {
            throw new AppError('Your reserved slot is currently occupied by another vehicle', 409, 'FIXED_SLOT_OCCUPIED');
          }
          ltSlotId = ltSlot._id;
        } else {
          // Gói floating: gán 1 slot trống thuộc dãy "subscriber" + đúng loại xe.
          // Staff chọn → validate tương thích; không chọn → tự gợi ý slot phù hợp.
          ltSlotId = asObjectId(payload?.slot || payload?.slotId);
          if (ltSlotId) {
            ltSlot = await ParkingSlot.findById(ltSlotId).session(session);
            if (!ltSlot || (ltSlot.building && String(ltSlot.building) !== String(buildingId))) {
              throw new AppError('Invalid slot', 400, 'INVALID_SLOT');
            }
            if (ltSlot.status !== 'available') {
              throw new AppError('The slot is occupied or unavailable', 409, 'SLOT_NOT_AVAILABLE');
            }
            if (!isSlotUsageCompatible(ltSlot, 'subscriber')) {
              if (!forceCheckIn) {
                throw new AppError('The slot is not in a zone for long-term packages', 409, 'SLOT_USAGE_MISMATCH');
              }
              ltSlotUsageBypassed = true;
            }
          } else {
            const [suggested] = await findCompatibleSlots(buildingId, vehicleType, 'subscriber', session);
            if (!suggested) {
              throw new AppError('No suitable slot available for the package vehicle', 409, 'SLOT_REQUIRED_FOR_LONG_TERM');
            }
            ltSlot = suggested;
            ltSlotId = suggested._id;
          }
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
          action: ltSlotUsageBypassed ? 'FORCE_SLOT_USAGE_BYPASS' : 'LONG_TERM_SUBSCRIPTION_CHECK_IN',
          entityType: 'ParkingSession',
          entityId: `${created[0]._id}`,
          building: buildingId,
          after: created[0].toObject(),
          metadata: {
            plateNumber,
            longTermSubscriptionId: `${longTerm._id}`,
            forceCheckIn: ltSlotUsageBypassed,
            slotUsageBypassed: ltSlotUsageBypassed,
            bypassedSlotUsageType: ltSlotUsageBypassed ? ltSlot?.usageType : null,
          },
        });

        return created[0];
      }

      // Link the session to the plate's owner account when one exists (account is
      // the secondary identifier). Format-tolerant so 59G2-03880 / 59G2-038.80 match.
      const registeredOwner = await User.findOne({
        'licensePlates.plateNumber': plateMatchRegex(plateNumber) || plateNumber,
      })
        .select('_id')
        .session(session);

      // Không phải gói (đã return ở trên) → khách vãng lai hoặc user thường check-in
      // trực tiếp: BẮT BUỘC thêm ảnh biển số (ảnh chân dung đã bắt buộc ở trên).
      if (!plateImage) {
        throw new AppError('A license plate photo is required to check in', 400, 'PLATE_IMAGE_REQUIRED');
      }

      // Đối tượng của lượt check-in (để khớp dãy/slot): có tài khoản → 'registered',
      // còn lại → 'walk_in'.
      const usageType = resolveCustomerUsageType({ longTerm: null, registeredOwner });

      // Tự gợi ý slot tương thích nếu staff chưa chọn.
      let selectedSlotId = asObjectId(payload?.slot);
      if (!selectedSlotId) {
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

      const slotId = selectedSlotId || null;
      // Loại xe của phiên sẽ lấy theo slot/dãy (manager cấu hình) khi có slot.
      let assignedSlotVehicleType = null;
      let walkInSlotUsageBypassed = false;
      let walkInBypassedSlotUsageType = null;
      if (slotId) {
        const slot = await ParkingSlot.findById(slotId).session(session);
        // Slot do staff chọn phải thuộc đúng tòa nhà đang check-in.
        if (slot && slot.building && String(slot.building) !== String(buildingId)) {
          throw new AppError('Invalid slot', 400, 'INVALID_SLOT');
        }
        if (slot?.status === 'maintenance') {
          throw new AppError('Assigned slot is under maintenance', 409, 'SLOT_MAINTENANCE_NOT_AVAILABLE');
        }
        if (slot?.status !== 'available') {
          throw new AppError('The slot is occupied or unavailable', 409, 'SLOT_NOT_AVAILABLE');
        }
        // Chỉ chặn theo ĐỐI TƯỢNG. Loại xe do dãy/slot quyết định nên không chặn —
        // staff tự do chọn dãy loại xe nào sau khi camera nhận diện.
        if (slot && !isSlotUsageCompatible(slot, usageType)) {
          if (!forceCheckIn) {
            throw new AppError('The slot is not in a zone for this usage class', 409, 'SLOT_USAGE_MISMATCH');
          }
          walkInSlotUsageBypassed = true;
          walkInBypassedSlotUsageType = slot.usageType;
        }
        if (slot) {
          assignedSlotVehicleType = slot.vehicleType || null;
          slot.status = 'occupied';
          await slot.save({ session });
        }
      }

      const created = await ParkingSession.create(
        [{
          plateNumber,
          building: buildingId,
          staff: user._id,
          user: registeredOwner?._id || null,
          slot: slotId,
          // Ưu tiên loại xe của dãy/slot; fallback loại xe camera nhận diện.
          vehicleType: assignedSlotVehicleType || vehicleType,
          vehicleBrand,
          plateImage,
          portraitImage,
          entryGate: gate,
          note: duplicate && forceCheckIn ? 'duplicate_bypassed' : '',
        }],
        { session },
      );

      await logAudit(session, {
        actor: user._id,
        action: walkInSlotUsageBypassed
          ? 'FORCE_SLOT_USAGE_BYPASS'
          : duplicate && forceCheckIn
            ? 'DUPLICATE_PLATE_BYPASS'
            : 'PARKING_SESSION_CHECK_IN',
        entityType: 'ParkingSession',
        entityId: `${created[0]._id}`,
        building: buildingId,
        after: created[0].toObject(),
        metadata: {
          plateNumber,
          duplicatePlateWarning: Boolean(duplicate),
          forceCheckIn,
          slotUsageBypassed: walkInSlotUsageBypassed,
          bypassedSlotUsageType: walkInBypassedSlotUsageType,
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
