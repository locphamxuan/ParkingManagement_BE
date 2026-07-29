const mongoose = require('mongoose');
const AppError = require('../../../utils/AppError');
const buildingRepository = require('../../../repositories/building.repository');
const {
  ParkingSession,
  ParkingSlot,
  VehicleType,
  Zone,
  User,
  Notification,
} = require('../../../models');
const { assertBuildingScope, logAudit } = require('../../../utils/staffScope');
const { normalizePlate, plateMatchRegex } = require('../../../utils/plate.util');
const {
  assertBuildingAcceptsEntry,
  assertStaffHasActiveShift,
} = require('../../shared/entryAuthorization.service');
const { resolveOperationalGate } = require('../../shared/gateAuthorization.service');
const {
  occupyFixedSlotForCheckIn,
} = require('../../shared/slotLifecycle.service');
const { assertEvidenceImage } = require('../../../utils/evidence');
const {
  resolveVehicleTypeId,
  vehicleKindFromType,
  loadVehicleKind,
  packageVehicleOf,
  assertPackageVehicleKind,
  asObjectId,
  findDuplicateActiveSession,
  isDuplicateActiveSessionError,
  duplicateActiveSessionError,
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

// Loại xe của GÓI là ràng buộc cứng: ô dành cho ô tô không nhận xe của gói xe máy
// và ngược lại. Slot "vạn năng" (vehicleType = null) hợp với mọi gói.
const assertSlotMatchesPackageVehicle = async (slot, packageVehicleKind, mongoSession) => {
  if (!slot || !packageVehicleKind) return;
  const slotKind = await loadVehicleKind(slot.vehicleType, mongoSession);
  assertPackageVehicleKind(
    packageVehicleKind,
    slotKind,
    `This slot is configured for ${slotKind} vehicles but the long-term package covers ${packageVehicleKind} vehicles`,
  );
};

const resolveSelectedZone = async ({ zoneId, buildingId, vehicleType, usageType, mongoSession, forceCheckIn }) => {
  if (!zoneId) return null;

  const zone = await Zone.findOne({ _id: zoneId, building: buildingId }).session(mongoSession);
  if (!zone) throw new AppError('Invalid zone', 400, 'INVALID_ZONE');
  if (vehicleType && zone.vehicleType && String(zone.vehicleType) !== String(vehicleType)) {
    throw new AppError('The selected zone is not configured for this vehicle type', 409, 'ZONE_VEHICLE_TYPE_MISMATCH');
  }
  if (!isSlotUsageCompatible(zone, usageType) && !forceCheckIn) {
    throw new AppError('The selected zone is not allowed for this customer type', 409, 'ZONE_USAGE_MISMATCH');
  }
  return zone;
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
      const vehicleTypeRecord = vehicleType
        ? await VehicleType.findById(vehicleType).session(session)
        : null;
      const isMotorcycle = vehicleKindFromType(vehicleTypeRecord) === 'motorcycle';
      const requestedZoneId = asObjectId(payload?.zone || payload?.zoneId);
      const requestedGateId = payload?.gate || payload?.entryGate || null;
      const forceCheckIn = Boolean(payload?.forceCheckIn);
      const vehicleBrand = payload?.vehicleBrand
        ? `${payload.vehicleBrand}`.trim()
        : null;
      // FE có 3 camera RIÊNG BIỆT:
      //  1) Camera chân dung → portraitImage (tài xế) — BẮT BUỘC mọi check-in.
      //  2) Camera biển số   → plateImage.
      //  3) Camera QR account/phương tiện → resolve qua endpoint riêng (không lưu ảnh).
      const plateImage = assertEvidenceImage(payload?.plateImage, 'plateImage', { required: false });
      if (!payload?.portraitImage) {
        throw new AppError(
          'A driver portrait photo is required to verify the person at pickup',
          400,
          'PORTRAIT_REQUIRED',
        );
      }
      const portraitImage = assertEvidenceImage(payload?.portraitImage, 'portraitImage', { required: true });

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

      const authorizationTime = new Date();
      assertBuildingAcceptsEntry(building, authorizationTime);
      const activeStaffShift = await assertStaffHasActiveShift(
        user._id,
        buildingId,
        authorizationTime,
        session,
      );
      const entryGate = await resolveOperationalGate({
        gateId: requestedGateId,
        buildingId,
        operation: 'in',
        assignedGateId: activeStaffShift.gate?._id || activeStaffShift.gate || null,
        mongoSession: session,
      });

      // Ảnh CHÂN DUNG bắt buộc cho MỌI check-in (kể cả gói) để đối chiếu người khi lấy
      // xe. Ảnh BIỂN SỐ bắt buộc thêm với khách vãng lai / user thường (kiểm tra ở
      // dưới); gói định danh bằng quét biển/QR nên không bắt ảnh biển.
      // Nhận diện gói dài hạn sớm (qua biển số lấy từ QR phương tiện hoặc nhập tay).
      const longTerm = await resolveLongTermSubscription(plateNumber, allowedBuildings, session);

      // Gói floating: không còn slot cố định → mọi xe (kể cả gói) đều theo capacity.
      const { totalSlots, activeSessions } = await findCapacityForBuilding(buildingId);
      if (totalSlots > 0 && activeSessions >= totalSlots) {
        throw new AppError('Building is at capacity', 409);
      }

      // Một biển số chỉ được có MỘT phiên active trong tòa này — bất biến vật lý
      // (xe không thể ở trong bãi 2 lần). `forceCheckIn` KHÔNG bỏ qua được: nó chỉ
      // dùng cho các cảnh báo mềm khác (dãy slot/loại xe). Muốn cho xe vào lại thì
      // phải cho phiên cũ ra trước.
      const duplicate = await findDuplicateActiveSession(plateNumber, buildingId, session);
      if (duplicate) {
        throw duplicateActiveSessionError();
      }

      if (longTerm) {
        let ltSlot;
        let ltSlotId;
        let ltSlotUsageBypassed = false;

        // Gói dài hạn gắn với 1 loại xe — đó mới là nguồn sự thật lúc vào bãi.
        // Camera nhận diện sai / client gửi sai loại xe KHÔNG được đẩy xe của gói
        // xe máy vào ô ô tô (và ngược lại); forceCheckIn cũng không bỏ qua được.
        const { id: packageVehicleTypeId, kind: packageVehicleKind } = packageVehicleOf(longTerm);
        assertPackageVehicleKind(
          packageVehicleKind,
          vehicleTypeRecord ? vehicleKindFromType(vehicleTypeRecord) : null,
          'The requested vehicle type does not match the long-term package vehicle type',
        );
        const ltVehicleType = packageVehicleTypeId || vehicleType;
        const ltIsMotorcycle = packageVehicleKind ? packageVehicleKind === 'motorcycle' : isMotorcycle;

        // Ưu tiên SLOT CỐ ĐỊNH của gói (nếu user đã chọn lúc mua): ô đang giữ chỗ
        // 'reserved' → chuyển 'occupied'. Nếu bị chiếm ('occupied') thì báo lỗi để
        // staff xử lý (user có thể báo sự cố).
        const fixedSlotId = longTerm.slot?._id || longTerm.slot || null;
        if (fixedSlotId) {
          ltSlot = await occupyFixedSlotForCheckIn(longTerm, buildingId, session);
          ltSlotId = ltSlot._id;
          // Dữ liệu cũ/hỏng: slot cố định gắn loại xe khác gói → dừng lại thay vì
          // tạo phiên lệch loại xe (kéo theo tính phí vượt giờ sai).
          await assertSlotMatchesPackageVehicle(ltSlot, packageVehicleKind, session);
        } else {
          const selectedZone = await resolveSelectedZone({
            zoneId: requestedZoneId,
            buildingId,
            vehicleType: ltVehicleType,
            usageType: 'subscriber',
            mongoSession: session,
            forceCheckIn,
          });
          // Gói floating: gán 1 slot trống thuộc dãy "subscriber" + đúng loại xe CỦA GÓI.
          // Staff chọn → validate tương thích; không chọn → tự gợi ý slot phù hợp.
          const requestedSlotId = asObjectId(payload?.slot || payload?.slotId);
          // Xe máy chỉ chọn DÃY (hệ thống tự gán ô), nhưng slot gửi kèm vẫn phải
          // đúng loại xe của gói — báo lỗi thay vì bỏ qua âm thầm.
          if (requestedSlotId && ltIsMotorcycle) {
            await assertSlotMatchesPackageVehicle(
              await ParkingSlot.findById(requestedSlotId).session(session),
              packageVehicleKind,
              session,
            );
          }
          ltSlotId = ltIsMotorcycle ? null : requestedSlotId;
          if (selectedZone && !ltIsMotorcycle && !ltSlotId) {
            throw new AppError('Please select a parking slot in the selected zone', 400, 'SLOT_REQUIRED');
          }
          if (ltSlotId) {
            ltSlot = await ParkingSlot.findById(ltSlotId).session(session);
            if (!ltSlot || (ltSlot.building && String(ltSlot.building) !== String(buildingId))) {
              throw new AppError('Invalid slot', 400, 'INVALID_SLOT');
            }
            await assertSlotMatchesPackageVehicle(ltSlot, packageVehicleKind, session);
            if (ltSlot.status !== 'available') {
              throw new AppError('The slot is occupied or unavailable', 409, 'SLOT_NOT_AVAILABLE');
            }
            if (selectedZone && String(ltSlot.zone) !== String(selectedZone._id)) {
              throw new AppError('The selected slot does not belong to the selected zone', 409, 'SLOT_ZONE_MISMATCH');
            }
            if (!isSlotUsageCompatible(ltSlot, 'subscriber')) {
              if (!forceCheckIn) {
                throw new AppError('The slot is not in a zone for long-term packages', 409, 'SLOT_USAGE_MISMATCH');
              }
              ltSlotUsageBypassed = true;
            }
          } else {
            const [suggested] = await findCompatibleSlots(
              buildingId, ltVehicleType, 'subscriber', session, selectedZone?._id || null,
            );
            if (!suggested) {
              throw new AppError(
                selectedZone ? 'No suitable slot is available in the selected zone' : 'No suitable slot available for the package vehicle',
                409,
                'SLOT_REQUIRED_FOR_LONG_TERM',
              );
            }
            ltSlot = suggested;
            ltSlotId = suggested._id;
          }
        }
        if (!fixedSlotId) {
          ltSlot.status = 'occupied';
          await ltSlot.save({ session });
        }

        const created = await ParkingSession.create(
          [{
            plateNumber,
            building: buildingId,
            staff: user._id,
            user: longTerm.user,
            fee: 0,
            paymentMethod: 'long_term',
            // Loại xe của phiên theo GÓI (đã đối chiếu với slot ở trên); slot/camera
            // chỉ là fallback khi gói không còn loại xe hợp lệ.
            vehicleType: ltVehicleType || ltSlot.vehicleType,
            vehicleBrand,
            plateImage,
            portraitImage,
            entryGate: entryGate?._id || null,
            slot: ltSlotId,
            note: `long_term:${longTerm._id}`,
          }],
          { session },
        );

        if (created[0].user) {
          try {
            await Notification.insertMany([{
              user: created[0].user,
              type: 'general',
              title: 'Xe đã check-in vào bãi',
              message: `Xe ${plateNumber} đã check-in thành công qua cổng.`,
              building: buildingId,
              plateNumber,
              isRead: false,
            }], { session });
          } catch (e) {
            // non-blocking
          }
        }

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
            staffShiftId: `${activeStaffShift._id}`,
            assignedGateId: activeStaffShift.gate?._id
              ? `${activeStaffShift.gate._id}`
              : activeStaffShift.gate
                ? `${activeStaffShift.gate}`
                : null,
          },
        });

        return created[0];
      }

      // Link the session to the plate's owner account when one exists (account is
      // the secondary identifier). Format-tolerant so 59G2-03880 / 59G2-038.80 match.
      const registeredOwners = await User.find({
        'licensePlates.plateNumber': plateMatchRegex(plateNumber) || plateNumber,
      })
        .select('_id licensePlates')
        .session(session);
      if (registeredOwners.length > 1) {
        throw new AppError(
          'This license plate is linked to multiple accounts and must be resolved by an administrator',
          409,
          'DUPLICATE_PLATE_OWNERSHIP',
        );
      }
      const registeredOwner = registeredOwners[0] || null;
      const registeredPlate = registeredOwner?.licensePlates?.find(
        (item) => normalizePlate(item.plateNumber) === plateNumber,
      );
      if (registeredPlate) {
        const registeredKind = ['motorcycle', 'ebike', 'emotorbike'].includes(registeredPlate.vehicleType)
          ? 'motorcycle'
          : 'car';
        const detectedKind = vehicleKindFromType(vehicleTypeRecord);
        if (detectedKind && registeredKind !== detectedKind) {
          if (!forceCheckIn) {
            throw new AppError(
              `Vehicle type does not match registration (registered: ${registeredKind}).`,
              409,
              'VEHICLE_TYPE_MISMATCH',
            );
          }
          if (!`${payload?.overrideReason || ''}`.trim()) {
            throw new AppError(
              'An override reason is required when the vehicle type differs from registration',
              400,
              'OVERRIDE_REASON_REQUIRED',
            );
          }
        }
      }

      // Đối tượng của lượt check-in (để khớp dãy/slot): có tài khoản → 'registered',
      // còn lại → 'walk_in'.
      const usageType = resolveCustomerUsageType({ longTerm: null, registeredOwner });

      // Tự gợi ý slot tương thích nếu staff chưa chọn.
      const selectedZone = await resolveSelectedZone({
        zoneId: requestedZoneId,
        buildingId,
        vehicleType,
        usageType,
        mongoSession: session,
        forceCheckIn,
      });
      // Motorcycles select a zone only; the system allocates a free bay there.
      let selectedSlotId = isMotorcycle ? null : asObjectId(payload?.slot || payload?.slotId);
      if (selectedZone && !isMotorcycle && !selectedSlotId) {
        throw new AppError('Please select a parking slot in the selected zone', 400, 'SLOT_REQUIRED');
      }
      if (!selectedSlotId) {
        const [suggested] = await findCompatibleSlots(
          buildingId, vehicleType, usageType, session, selectedZone?._id || null,
        );
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
        if (selectedZone && String(slot.zone) !== String(selectedZone._id)) {
          throw new AppError('The selected slot does not belong to the selected zone', 409, 'SLOT_ZONE_MISMATCH');
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
          entryGate: entryGate?._id || null,
          note: '',
        }],
        { session },
      );

      if (created[0].user) {
        try {
          await Notification.insertMany([{
            user: created[0].user,
            type: 'general',
            title: 'Xe đã check-in vào bãi',
            message: `Xe ${plateNumber} đã check-in thành công qua cổng.`,
            building: buildingId,
            plateNumber,
            isRead: false,
          }], { session });
        } catch (e) {
          // non-blocking
        }
      }

      await logAudit(session, {
        actor: user._id,
        action: walkInSlotUsageBypassed ? 'FORCE_SLOT_USAGE_BYPASS' : 'PARKING_SESSION_CHECK_IN',
        entityType: 'ParkingSession',
        entityId: `${created[0]._id}`,
        building: buildingId,
        after: created[0].toObject(),
        metadata: {
          plateNumber,
          forceCheckIn,
          overrideReason: forceCheckIn ? `${payload?.overrideReason || ''}`.trim() || null : null,
          slotUsageBypassed: walkInSlotUsageBypassed,
          bypassedSlotUsageType: walkInBypassedSlotUsageType,
          staffShiftId: `${activeStaffShift._id}`,
          assignedGateId: activeStaffShift.gate?._id
            ? `${activeStaffShift.gate._id}`
            : activeStaffShift.gate
              ? `${activeStaffShift.gate}`
              : null,
        },
      });

      return created[0];
    });

    return result;
  } catch (error) {
    // Hai lượt check-in song song (2 staff, hoặc staff + kiosk) cùng lọt qua bước
    // kiểm tra trùng → unique index chặn ở tầng DB. Đổi sang lỗi nghiệp vụ để staff
    // hiểu phải làm gì, thay vì trả lỗi Mongo thô.
    if (isDuplicateActiveSessionError(error)) throw duplicateActiveSessionError();
    throw error;
  } finally {
    session.endSession();
  }
};

module.exports = { checkIn };
