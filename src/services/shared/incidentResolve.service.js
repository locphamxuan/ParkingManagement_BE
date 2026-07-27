const mongoose = require('mongoose');
const {
  Incident, ParkingSession, Payment, Notification, User, WalletTransaction, LongTermSubscription, ViolationType,
} = require('../../models');
const AppError = require('../../utils/AppError');
const { normalizePlate, plateMatchRegex } = require('../../utils/plate.util');
const { writeAuditLog } = require('../../utils/audit');
const buildingWalletService = require('../manager/buildingWallet.service');
const { ROLES } = require('../../constants/roles');

const { INCIDENT_STATUS } = Incident;

const POPULATE_BUILDING = { path: 'building', select: '_id code name' };
const POPULATE_SLOT = { path: 'slot', select: '_id code' };
const POPULATE_REPORTER = { path: 'reportedBy', select: '_id fullName email' };
const POPULATE_RESOLVER = { path: 'resolvedBy', select: '_id fullName email' };

const MANAGER_ROLES = [ROLES.MANAGER, ROLES.ADMIN];

/**
 * Tra cứu biển số vi phạm đã có account (subscription hoặc phiên gắn user) trong
 * building hay chưa — dùng để tự động escalate incident cho manager khi KHÔNG tìm
 * thấy (rule: biển lạ/không rõ chủ thì chỉ manager mới đủ thẩm quyền xử lý).
 */
const findPlateAccountInBuilding = async (plate, buildingId) => {
  if (!plate || !buildingId) return false;
  const rx = plateMatchRegex(plate) || plate;
  const [sub, session] = await Promise.all([
    LongTermSubscription.findOne({ plateNumber: rx, building: buildingId, status: 'active' }).select('_id'),
    ParkingSession.findOne({ plateNumber: rx, building: buildingId, user: { $ne: null } }).select('_id'),
  ]);
  return Boolean(sub || session);
};

/**
 * Gọi TRONG transaction check-out của staff (`checkOut.service.js`): nếu biển số
 * của phiên đang check-out khớp 1 incident đang `penalty_pending` (manager đã duyệt
 * số tiền) trong building, thu luôn phí phạt kèm lượt check-out này — Payment RIÊNG
 * (không gộp vào phí gửi xe, để tách bạch trên báo cáo), theo đúng phương thức
 * staff/khách chọn lúc check-out (cash → pending chờ manager xác nhận thu, như phí
 * gửi xe thường; điện tử → cộng ví tòa ngay) — rồi resolve incident.
 *
 * Trả về Payment vừa tạo, hoặc null nếu không có penalty đang chờ cho biển số này.
 */
const settlePendingPenaltyAtCheckout = async (staffUser, parkingSession, paymentMethod, mongoSession) => {
  const rx = plateMatchRegex(parkingSession.plateNumber) || parkingSession.plateNumber;
  const incident = await Incident.findOne({
    building: parkingSession.building,
    violatorPlate: rx,
    status: 'penalty_pending',
  }).session(mongoSession);
  if (!incident) return null;

  const penaltyFee = Number(incident.penaltyFee || 0);
  const isCashPending = paymentMethod === 'cash';

  if (!isCashPending && paymentMethod === 'wallet' && penaltyFee > 0) {
    if (!parkingSession.user) {
      throw new AppError('No account linked to this plate for wallet payment — use cash instead', 400, 'NO_WALLET_ACCOUNT');
    }
    const paidUser = await User.findOneAndUpdate(
      { _id: parkingSession.user, walletBalance: { $gte: penaltyFee } },
      { $inc: { walletBalance: -penaltyFee } },
      { new: true, session: mongoSession },
    );
    if (!paidUser) {
      throw new AppError(
        `Insufficient wallet balance to collect penalty fee: ${penaltyFee.toLocaleString('en-US')} VND`,
        409,
        'INSUFFICIENT_WALLET_BALANCE',
      );
    }
    await WalletTransaction.create([{
      user: parkingSession.user,
      type: 'debit',
      amount: penaltyFee,
      balanceAfter: paidUser.walletBalance,
      status: 'success',
      reason: 'parking_checkout',
      metadata: { incidentPenalty: true, incidentId: `${incident._id}` },
    }], { session: mongoSession });
  }

  const [payment] = await Payment.create([{
    building: parkingSession.building,
    type: 'penalty',
    method: paymentMethod,
    amount: penaltyFee,
    status: isCashPending ? 'pending' : 'success',
    parkingSession: parkingSession._id,
    user: parkingSession.user || null,
    staff: staffUser._id,
    incident: incident._id,
    note: `Violator penalty fee collected at checkout (incident ${incident.code})`,
  }], { session: mongoSession });

  if (penaltyFee > 0 && !isCashPending) {
    await buildingWalletService.credit(parkingSession.building, penaltyFee, 'penalty_fee', payment._id, mongoSession);
  }

  incident.status = 'resolved';
  incident.paymentMethod = paymentMethod;
  incident.payment = payment._id;
  incident.resolvedBy = staffUser._id;
  incident.resolvedAt = new Date();
  await incident.save({ session: mongoSession });

  const notificationsToCreate = [{
    user: incident.reportedBy,
    type: 'incident_resolved',
    title: 'Your incident has been resolved',
    message: `Incident ${incident.code} has been resolved — the violator was charged a ${penaltyFee.toLocaleString('en-US')} VND penalty fee at checkout.`,
    building: incident.building,
    isRead: false,
  }];

  if (parkingSession.user && String(parkingSession.user) !== String(incident.reportedBy)) {
    notificationsToCreate.push({
      user: parkingSession.user,
      type: 'incident_resolved',
      title: 'Violation Penalty Collected',
      message: `A penalty fee of ${penaltyFee.toLocaleString('vi-VN')} VND for violation (${incident.type}) on vehicle ${parkingSession.plateNumber} was settled upon checkout.`,
      building: parkingSession.building,
      plateNumber: parkingSession.plateNumber,
      isRead: false,
    });
  }

  await Notification.insertMany(notificationsToCreate, { session: mongoSession });

  return payment;
};

/**
 * Áp một hành động xử lý sự cố (dùng chung cho staff & manager). Incident đã được
 * caller LOAD + KIỂM TRA phạm vi tòa nhà trước khi gọi.
 *
 * payload: { status?, resolutionNote?, violatorPlate?, action?, penaltyFee? }
 *   - action === 'penalize_violator' → CHỈ manager/admin: DUYỆT số tiền phạt (không
 *     thu ngay) → incident chuyển 'penalty_pending'. Tiền chỉ thực thu khi STAFF
 *     check-out xe vi phạm qua cổng như bình thường (xem `settlePendingPenaltyAtCheckout`
 *     ở trên) — vì manager thường không có mặt tại cổng để tự tay check-out xe.
 *     Phương thức thanh toán do staff/khách chọn LÚC check-out, không phải lúc duyệt.
 *
 * Incident đang 'escalated' (biển vi phạm không có account trong building) → CHỈ
 * manager/admin được xử lý (mọi action, không riêng penalize); staff chỉ xem (GET).
 */
const applyIncidentAction = async (actorUser, incident, payload = {}) => {
  const isManager = MANAGER_ROLES.includes(actorUser.role);

  if (incident.status === 'escalated' && !isManager) {
    throw new AppError(
      'This incident was auto-escalated (violator plate has no registered account in this building) — only a manager can handle it',
      403,
      'ESCALATED_MANAGER_ONLY',
    );
  }

  // Một khi manager đã duyệt phạt (penalty_pending), status chỉ được đổi tự động bởi
  // `settlePendingPenaltyAtCheckout` lúc xe ra cổng — chặn PATCH status thủ công để
  // tránh "mất dấu" khoản phạt đã duyệt nhưng chưa thu (incident bị đổi sang open/resolved
  // trong khi checkout vẫn còn tìm penalty_pending để thu tiền, không bao giờ khớp nữa).
  if (incident.status === 'penalty_pending' && payload.status !== undefined) {
    throw new AppError(
      'This incident has an approved pending penalty — it resolves automatically when the violator checks out and cannot have its status changed manually',
      409,
      'PENALTY_PENDING_LOCKED',
    );
  }

  const before = incident.toObject();
  const mongoSession = await mongoose.startSession();
  try {
    let result;
    await mongoSession.withTransaction(async () => {
      const update = {};

      if (payload.violatorPlate !== undefined) {
        update.violatorPlate = normalizePlate(payload.violatorPlate) || '';
      }
      if (payload.resolutionNote !== undefined) {
        update.resolutionNote = String(payload.resolutionNote).trim();
      }

      if (payload.action === 'penalize_violator') {
        if (!isManager) {
          throw new AppError('Only a manager can apply a penalty fee', 403, 'MANAGER_ONLY_ACTION');
        }
        // Chặn duyệt phạt lại trên incident đã 'resolved'/'closed' — tránh double-charge:
        // incident này đã xử lý xong (có thể đã thu tiền), duyệt lại sẽ mở một khoản phạt
        // 'penalty_pending' MỚI cho biển số này, thu thêm lần nữa ở lượt check-out kế tiếp.
        // Vi phạm mới cho cùng biển số phải là 1 incident mới, không phải mở lại cái cũ.
        if (incident.status === 'resolved' || incident.status === 'closed') {
          throw new AppError(
            'This incident is already resolved/closed — report a new incident to penalize a further violation',
            409,
            'INCIDENT_ALREADY_RESOLVED',
          );
        }
        const plate = normalizePlate(payload.violatorPlate || incident.violatorPlate);
        if (!plate) {
          throw new AppError('violatorPlate is required to penalize the offending vehicle', 400, 'VIOLATOR_PLATE_REQUIRED');
        }

        // Phí phạt lấy từ bảng giá manager tự cấu hình theo TỪNG loại vi phạm
        // (ViolationType, khớp incident.type) — manager KHÔNG được tự nhập số tùy ý
        // cho các loại đã phân loại (tránh set phí quá cao/tuỳ tiện). Chỉ incident
        // type='other' (hoặc loại không còn/không có trong bảng giá — vd đã bị xoá,
        // hoặc incident cũ từ trước khi có tính năng này) mới cho phép manager tự
        // nhập penaltyFee thủ công.
        let penaltyFee;
        const violationType = incident.type === 'other'
          ? null
          : await ViolationType.findOne({ building: incident.building, code: incident.type });

        if (violationType) {
          penaltyFee = violationType.fee;
        } else {
          if (payload.penaltyFee === undefined || payload.penaltyFee === null) {
            throw new AppError(
              incident.type === 'other'
                ? "penaltyFee is required for 'other' incidents — there is no preset violation fee"
                : 'No configured violation-type fee found for this incident type — enter a penaltyFee manually',
              400,
              'PENALTY_FEE_REQUIRED',
            );
          }
          penaltyFee = Number(payload.penaltyFee);
        }

        if (!Number.isFinite(penaltyFee) || penaltyFee < 0) {
          throw new AppError('penaltyFee must be a non-negative number', 400, 'INVALID_PENALTY_FEE');
        }
        update.violatorPlate = plate;
        update.penaltyFee = penaltyFee;
        update.penaltyApprovedBy = actorUser._id;
        update.status = 'penalty_pending';
      } else if (payload.status !== undefined) {
        if (!INCIDENT_STATUS.includes(payload.status)) {
          throw new AppError(`status must be one of: ${INCIDENT_STATUS.join(', ')}`, 400, 'INVALID_STATUS');
        }
        // 'penalty_pending' chỉ được đặt qua action='penalize_violator' (luôn kèm
        // penaltyFee đã duyệt) — chặn set tay để tránh incident "chờ thu phí" ma (fee null).
        if (payload.status === 'penalty_pending') {
          throw new AppError("status 'penalty_pending' can only be set via action='penalize_violator'", 400, 'INVALID_STATUS');
        }
        update.status = payload.status;
      }

      if (update.status === 'resolved' || update.status === 'closed') {
        update.resolvedBy = actorUser._id;
        update.resolvedAt = new Date();
      }

      const updated = await Incident.findByIdAndUpdate(incident._id, update, {
        new: true,
        runValidators: true,
        session: mongoSession,
      })
        .populate(POPULATE_BUILDING)
        .populate(POPULATE_SLOT)
        .populate(POPULATE_REPORTER)
        .populate(POPULATE_RESOLVER);

      // Thông báo cho người báo cáo và chủ xe vi phạm (nếu có tài khoản).
      const isDone = update.status === 'resolved' || update.status === 'closed';
      const isPenaltyPending = update.status === 'penalty_pending';
      const notificationsToCreate = [{
        user: incident.reportedBy,
        type: isDone ? 'incident_resolved' : 'incident_update',
        title: isDone ? 'Your incident has been resolved' : 'Your incident is being handled',
        message: isDone
          ? `Incident ${incident.code} has been ${update.status}.${update.resolutionNote ? ` Note: ${update.resolutionNote}` : ''}`
          : isPenaltyPending
            ? `Incident ${incident.code}: a penalty fee of ${update.penaltyFee.toLocaleString('en-US')} VND has been approved for the violator and will be collected when the vehicle exits.`
            : `Incident ${incident.code} status: ${update.status || incident.status}.`,
        building: incident.building,
        isRead: false,
      }];

      if (isPenaltyPending && update.violatorPlate) {
        const violatorRx = plateMatchRegex(update.violatorPlate) || update.violatorPlate;
        const [violatorSub, violatorSession] = await Promise.all([
          LongTermSubscription.findOne({ plateNumber: violatorRx, building: incident.building }).select('user').session(mongoSession),
          ParkingSession.findOne({ plateNumber: violatorRx, building: incident.building, user: { $ne: null } }).select('user').session(mongoSession),
        ]);

        const violatorUserId = violatorSub?.user || violatorSession?.user;
        if (violatorUserId && String(violatorUserId) !== String(incident.reportedBy)) {
          notificationsToCreate.push({
            user: violatorUserId,
            type: 'incident_update',
            title: 'Penalty Fee Approved for Vehicle',
            message: `A violation (${incident.type}) for vehicle ${update.violatorPlate} was recorded. A penalty fee of ${update.penaltyFee.toLocaleString('vi-VN')} VND has been approved and will be collected upon checkout.`,
            building: incident.building,
            plateNumber: update.violatorPlate,
            isRead: false,
          });
        }
      }

      await Notification.insertMany(notificationsToCreate, { session: mongoSession });

      result = { item: updated };
    });

    await writeAuditLog({
      actor: actorUser,
      action: 'RESOLVE_INCIDENT',
      targetTable: 'Incident',
      targetId: `${incident._id}`,
      building: incident.building,
      previousValue: before,
      newValue: result.item.toObject(),
    });

    return result;
  } finally {
    mongoSession.endSession();
  }
};

module.exports = { applyIncidentAction, findPlateAccountInBuilding, settlePendingPenaltyAtCheckout };
