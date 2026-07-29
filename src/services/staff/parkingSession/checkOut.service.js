const mongoose = require('mongoose');
const logger = require("../../../utils/logger");
const AppError = require('../../../utils/AppError');
const {
  ParkingSession,
  LongTermSubscription,
  Incident,
  Payment,
  WalletTransaction,
  User,
  Notification,
} = require('../../../models');
const { assertBuildingScope, logAudit } = require('../../../utils/staffScope');
const buildingWalletService = require('../../manager/buildingWallet.service');
const { settlePendingPenaltyAtCheckout } = require('../../shared/incidentResolve.service');
const { normalizePlate, plateMatchRegex } = require('../../../utils/plate.util');
const { calculateParkingFee } = require('../../../utils/feeEngine');
const { computeDailyOverageHours } = require('../../../utils/longTermUsage');
const { sendNotificationEmail } = require('../../../utils/email');
const { DEFAULT_HOURLY_RATE } = require('../../../constants/pricing');
const { vehicleKindFromType } = require('./helpers');
const { assertStaffHasActiveShift } = require('../../shared/entryAuthorization.service');
const { finalizeSlotAfterCheckout } = require('../../shared/slotLifecycle.service');
const { resolveOperationalGate } = require('../../shared/gateAuthorization.service');
const { assertEvidenceImage } = require('../../../utils/evidence');

// ── Helpers (module-private) ─────────────────────────────────────────────────

async function _verifyAndLoadSession(user, sessionId, payload, mongoSession) {
  if (!sessionId) {
    throw new AppError('sessionId is required', 400, 'SESSION_ID_REQUIRED');
  }

  const parkingSession = await ParkingSession.findById(sessionId)
    .populate('vehicleType', 'code name')
    .populate({ path: 'slot', select: 'floor', populate: { path: 'floor', select: '_id' } })
    .session(mongoSession);
  if (!parkingSession) {
    throw new AppError('Parking session not found', 404, 'SESSION_NOT_FOUND');
  }

  assertBuildingScope(user, parkingSession.building);

  let checkoutPayload = payload;
  if (payload.paymentMethod === 'payos') {
    const payment = await Payment.findOne({
      parkingSession: parkingSession._id,
      type: 'session',
      method: 'payos',
      status: 'success',
    }).session(mongoSession);
    const draft = payment?.checkoutDraft;
    if (!draft?.verifiedAt) {
      throw new AppError(
        'The confirmed PayOS payment has no verified checkout evidence',
        409,
        'PAYOS_CHECKOUT_DRAFT_NOT_FOUND',
      );
    }
    checkoutPayload = {
      ...payload,
      exitPlateImage: draft.exitPlateImage,
      exitPortraitImage: draft.exitPortraitImage,
      exitGate: draft.exitGate,
      bypassMismatch: draft.bypassMismatch,
    };
  }

  const activeStaffShift = await assertStaffHasActiveShift(
    user._id,
    parkingSession.building,
    new Date(),
    mongoSession,
  );
  const exitGate = await resolveOperationalGate({
    gateId: checkoutPayload.exitGate || checkoutPayload.gate || null,
    buildingId: parkingSession.building,
    operation: 'out',
    assignedGateId: activeStaffShift.gate?._id || activeStaffShift.gate || null,
    mongoSession,
  });

  if (parkingSession.status !== 'active') {
    throw new AppError('Session not active', 400);
  }

  const providedPlate = normalizePlate(checkoutPayload.plateNumber || checkoutPayload.exitPlateNumber);
  if (providedPlate && providedPlate !== normalizePlate(parkingSession.plateNumber) && !checkoutPayload.bypassMismatch) {
    throw new AppError('Plate mismatch requires bypass confirmation', 409, 'PLATE_MISMATCH_WARNING');
  }

  return {
    parkingSession,
    payload: checkoutPayload,
    exitPlateImage: assertEvidenceImage(checkoutPayload.exitPlateImage, 'exitPlateImage'),
    exitPortraitImage: assertEvidenceImage(checkoutPayload.exitPortraitImage, 'exitPortraitImage'),
    activeStaffShift,
    exitGate,
  };
}

// ── Session gói dài hạn ───────────────────────────────────────────────
// Đỗ trong hạn mức giờ/ngày của gói → MIỄN PHÍ. Phần đỗ VƯỢT hạn mức/ngày
// (cộng dồn theo ngày) bị tính phí theo PricePolicy thường và gửi thông báo.
// Gói floating: nhả slot về 'available' khi xe rời.
// Returns postCommitEmail object or null.
async function _handleLongTermCheckout(
  user,
  parkingSession,
  payload,
  exitPlateImage,
  exitPortraitImage,
  activeStaffShift,
  exitGate,
  mongoSession,
) {
  const now = new Date();
  let postCommitEmail = null;

  // Hạn mức giờ/ngày lấy từ gói gắn với subscription (note: long_term:<id>).
  let maxHoursPerDay = 0;
  const subMatch = /long_term:([a-f\d]{24})/i.exec(parkingSession.note || '');
  if (subMatch) {
    const sub = await LongTermSubscription.findById(subMatch[1])
      .populate('package', 'maxHoursPerDay')
      .session(mongoSession);
    maxHoursPerDay = Number(sub?.package?.maxHoursPerDay || 0);
  }

  let overageHours = await computeDailyOverageHours({
    plateNumber: parkingSession.plateNumber,
    building: parkingSession.building,
    entryTime: parkingSession.entryTime,
    exitTime: now,
    excludeSessionId: parkingSession._id,
    maxHoursPerDay,
    session: mongoSession,
  });

  // Chặn khai thác midnight: nếu xe đỗ 1 phiên liên tục vượt hạn mức/ngày,
  // cũng bị tính phần dư (tránh vào 23:00 ra 01:00 hôm sau thoát phí).
  if (maxHoursPerDay > 0) {
    const sessionHours = (now.getTime() - new Date(parkingSession.entryTime).getTime()) / (1000 * 60 * 60);
    const sessionOverage = Math.max(0, sessionHours - maxHoursPerDay);
    if (sessionOverage > overageHours) overageHours = sessionOverage;
  }

  let overageFee = 0;
  let feeMethod = 'long_term';

  if (overageHours > 0) {
    // Phí phần vượt = tính theo cửa sổ giờ cuối phiên (áp đúng peak/regular).
    const vtId = parkingSession.vehicleType?._id || parkingSession.vehicleType || null;
    const overageStart = new Date(now.getTime() - overageHours * 60 * 60 * 1000);
    overageFee = await calculateParkingFee(parkingSession.building, vtId, overageStart, now);
    if (!overageFee || overageFee <= 0) {
      const kind = vehicleKindFromType(parkingSession.vehicleType);
      overageFee = Math.ceil(overageHours) * (DEFAULT_HOURLY_RATE[kind] || DEFAULT_HOURLY_RATE.car);
    }
    feeMethod = payload.paymentMethod || 'cash';

    // Trả bằng ví → trừ ví chủ xe (đủ số dư mới qua); tiền mặt/khác → ghi nhận thu tại cổng.
    if (feeMethod === 'wallet') {
      if (!parkingSession.user) {
        throw new AppError('No user account linked to this session for wallet payment', 400);
      }
      const paidUser = await User.findOneAndUpdate(
        { _id: parkingSession.user, walletBalance: { $gte: overageFee } },
        { $inc: { walletBalance: -overageFee } },
        { new: true, session: mongoSession },
      );
      if (!paidUser) {
        throw new AppError(
          `Insufficient wallet balance for overage. Amount due: ${overageFee.toLocaleString('en-US')} VND`,
          409,
          'INSUFFICIENT_WALLET_BALANCE',
        );
      }
      await WalletTransaction.create(
        [{
          user: parkingSession.user,
          type: 'debit',
          amount: overageFee,
          balanceAfter: paidUser.walletBalance,
          status: 'success',
          reason: 'long_term_overage',
          metadata: { sessionId: `${parkingSession._id}`, overageHours },
        }],
        { session: mongoSession },
      );
    }

    const isCashPending = feeMethod === 'cash';
    const [payment] = await Payment.create(
      [{
        building: parkingSession.building,
        parkingSession: parkingSession._id,
        type: 'session',
        method: feeMethod,
        amount: overageFee,
        status: isCashPending ? 'pending' : 'success',
        user: parkingSession.user || null,
        staff: user._id,
        note: `long_term_overage:${overageHours.toFixed(2)}h`,
      }],
      { session: mongoSession },
    );

    if (!isCashPending) {
      await buildingWalletService.credit(
        parkingSession.building, overageFee, 'parking_fee', payment._id, mongoSession,
      );
    }

    if (parkingSession.user) {
      const capMsg = maxHoursPerDay ? `${maxHoursPerDay}h/day` : 'package';
      const message =
        `Vehicle ${parkingSession.plateNumber} parked over the daily limit of ${capMsg}. ` +
        `The extra ${overageHours.toFixed(1)} hour(s) cost ${overageFee.toLocaleString('vi-VN')} VND calculated at standard rate.`;
      try {
        await Notification.create([{
          user: parkingSession.user,
          type: 'subscription_overage',
          title: 'Daily Limit Exceeded',
          message,
          plateNumber: parkingSession.plateNumber,
          building: parkingSession.building,
        }], { session: mongoSession });
      } catch (e) {
        logger.error('[checkOut] overage notification failed:', e.message);
      }
      postCommitEmail = { userId: parkingSession.user, message };
    }
  }

  parkingSession.exitTime = now;
  parkingSession.status = 'completed';
  parkingSession.fee = overageFee;
  parkingSession.paymentMethod = feeMethod;
  parkingSession.exitPlateImage = exitPlateImage;
  parkingSession.exitPortraitImage = exitPortraitImage;
  parkingSession.exitGate = exitGate?._id || null;
  parkingSession.note = [
    parkingSession.note,
    overageHours > 0 ? `long_term_overage:${overageHours.toFixed(2)}h` : null,
    payload.bypassMismatch ? 'plate_mismatch_bypassed' : null,
  ].filter(Boolean).join(' | ');
  await parkingSession.save({ session: mongoSession });

  await finalizeSlotAfterCheckout(parkingSession, mongoSession, now);

  await logAudit(mongoSession, {
    actor: user._id,
    action: 'LONG_TERM_SUBSCRIPTION_CHECK_OUT',
    entityType: 'ParkingSession',
    entityId: `${parkingSession._id}`,
    building: parkingSession.building,
    after: parkingSession.toObject(),
    metadata: {
      paymentMethod: feeMethod,
      plateNumber: parkingSession.plateNumber,
      overageHours,
      overageFee,
      maxHoursPerDay,
      staffShiftId: `${activeStaffShift._id}`,
      assignedGateId: activeStaffShift.gate?._id
        ? `${activeStaffShift.gate._id}`
        : activeStaffShift.gate
          ? `${activeStaffShift.gate}`
          : null,
    },
  });

  return postCommitEmail;
}

// Tính phí cho checkout thường (khách vãng lai / user thường).
// Returns { fee, feeMethod }.
async function _computeRegularFee(parkingSession, payload, mongoSession) {
  const feeMethod = payload.paymentMethod || 'cash';
  if (feeMethod === 'payos') {
    const payment = await Payment.findOne({
      parkingSession: parkingSession._id,
      type: 'session',
      method: 'payos',
      status: 'success',
    }).session(mongoSession);
    if (!payment) {
      throw new AppError('PayOS payment has not been confirmed', 409, 'PAYOS_PAYMENT_NOT_CONFIRMED');
    }
    return { fee: payment.amount, feeMethod };
  }
  let fee = Number(parkingSession.fee || 0);
  if (!fee) {
    const now = new Date();
    const vtId = parkingSession.vehicleType?._id || parkingSession.vehicleType || null;
    // Price by vehicle type via PricePolicy (peak/regular split).
    fee = await calculateParkingFee(parkingSession.building, vtId, parkingSession.entryTime, now);
    if (!fee || fee <= 0) {
      // No PricePolicy configured → fallback to a flat hourly rate by vehicle kind.
      const kind = vehicleKindFromType(parkingSession.vehicleType);
      const hours = Math.max(1, Math.ceil((now.getTime() - new Date(parkingSession.entryTime).getTime()) / (1000 * 60 * 60)));
      fee = hours * (DEFAULT_HOURLY_RATE[kind] || DEFAULT_HOURLY_RATE.car);
    }
  }

  if (payload.adjustedFee !== undefined && payload.adjustedFee !== null) {
    if (!payload.adjustmentReason) {
      throw new AppError('adjustmentReason is required when adjustedFee is provided', 400, 'ADJUSTMENT_REASON_REQUIRED');
    }
    if (Number.isNaN(Number(payload.adjustedFee)) || Number(payload.adjustedFee) < 0) {
      throw new AppError('adjustedFee must be a non-negative number', 400, 'INVALID_ADJUSTED_FEE');
    }
    fee = Number(payload.adjustedFee);
  }

  if (payload.forceCheckoutReason) {
    const surcharge = Math.max(1, Math.ceil(fee * 0.25));
    fee += surcharge;
  }

  return { fee, feeMethod };
}

async function _assertPayosCheckoutCanComplete(parkingSession, feeMethod, mongoSession) {
  if (feeMethod === 'payos') {
    const pendingPenalty = await Incident.exists({
      building: parkingSession.building,
      violatorPlate: plateMatchRegex(parkingSession.plateNumber) || parkingSession.plateNumber,
      status: 'penalty_pending',
    }).session(mongoSession);
    if (pendingPenalty) {
      throw new AppError(
        'A pending penalty must be settled before this PayOS checkout can be completed',
        409,
        'PENDING_PENALTY_REQUIRES_MANUAL_PAYMENT',
      );
    }
    return;
  }

  const paidPayosIntent = await Payment.exists({
    parkingSession: parkingSession._id,
    type: 'session',
    method: 'payos',
    status: 'success',
  }).session(mongoSession);
  if (paidPayosIntent) {
    throw new AppError(
      'A PayOS payment has already been received for this session',
      409,
      'PAYOS_PAYMENT_ALREADY_RECEIVED',
    );
  }
}

// Trừ ví người dùng khi khách chọn thanh toán bằng ví lúc lấy xe.
async function _processWalletDebit(fee, targetUserId, parkingSession, mongoSession) {
  if (!targetUserId) {
    throw new AppError('No user account linked to this session for wallet payment', 400);
  }
  const paidUser = await User.findOneAndUpdate(
    { _id: targetUserId, walletBalance: { $gte: fee } },
    { $inc: { walletBalance: -fee } },
    { new: true, session: mongoSession },
  );
  if (!paidUser) {
    throw new AppError(
      `Insufficient wallet balance to complete checkout. Remaining amount due: ${fee.toLocaleString('en-US')} VND`,
      409,
      'INSUFFICIENT_WALLET_BALANCE',
    );
  }
  await WalletTransaction.create(
    [{
      user: targetUserId,
      type: 'debit',
      amount: fee,
      balanceAfter: paidUser.walletBalance,
      status: 'success',
      reason: 'parking_checkout',
      metadata: { sessionId: `${parkingSession._id}` },
    }],
    { session: mongoSession },
  );
}

// Tạo bản ghi Payment và cộng vào ví tòa nhà.
// Tiền mặt (cash) của khách vãng lai/user thường: KHÔNG cộng ví ngay mà để 'pending' —
// manager sẽ "Thu nhận" ở tab Ví để xác nhận đã nhận tiền → lúc đó mới cộng ví building.
// Các phương thức khác (wallet/qr/...) đã thu điện tử nên 'success' + cộng ví ngay.
async function _createPaymentRecord(parkingSession, fee, feeMethod, staff, payload, mongoSession) {
  if (feeMethod === 'payos') {
    const payment = await Payment.findOne({
      parkingSession: parkingSession._id,
      type: 'session',
      method: 'payos',
      status: 'success',
      amount: fee,
    }).session(mongoSession);
    if (!payment) {
      throw new AppError('PayOS payment does not match this checkout', 409, 'PAYOS_PAYMENT_MISMATCH');
    }
    return payment;
  }
  const isCashPending = feeMethod === 'cash';
  const [payment] = await Payment.create(
    [{
      building: parkingSession.building,
      parkingSession: parkingSession._id,
      type: 'session',
      method: feeMethod,
      amount: fee,
      status: isCashPending ? 'pending' : 'success',
      user: parkingSession.user || null,
      staff: staff._id,
      note: [
        payload.adjustmentReason,
        payload.forceCheckoutReason,
      ].filter(Boolean).join(' | '),
    }],
    { session: mongoSession },
  );

  if (fee > 0 && !isCashPending) {
    await buildingWalletService.credit(
      parkingSession.building,
      fee,
      'parking_fee',
      payment._id,
      mongoSession,
    );
  }

  return payment;
}

// Cập nhật trạng thái session, nhả slot, ghi audit.
async function _finalizeSession(
  user,
  parkingSession,
  payload,
  fee,
  feeMethod,
  exitPlateImage,
  exitPortraitImage,
  activeStaffShift,
  exitGate,
  mongoSession,
) {
  parkingSession.exitTime = new Date();
  parkingSession.status = 'completed';
  parkingSession.fee = fee;
  parkingSession.paymentMethod = feeMethod;
  parkingSession.exitPlateImage = exitPlateImage;
  parkingSession.exitPortraitImage = exitPortraitImage;
  parkingSession.exitGate = exitGate?._id || null;
  parkingSession.note = [parkingSession.note, payload.forceCheckoutReason, payload.bypassMismatch ? 'plate_mismatch_bypassed' : null]
    .filter(Boolean)
    .join(' | ');
  await parkingSession.save({ session: mongoSession });

  if (parkingSession.user) {
    try {
      await Notification.insertMany([{
        user: parkingSession.user,
        type: 'general',
        title: 'Xe đã xuất bãi thành công',
        message: `Xe ${parkingSession.plateNumber} đã hoàn tất check-out. Phí gửi xe: ${fee.toLocaleString('vi-VN')} VNĐ.`,
        building: parkingSession.building,
        plateNumber: parkingSession.plateNumber,
        isRead: false,
      }], { session: mongoSession });
    } catch (e) {
      logger.error('[checkOut] checkout notification failed:', e.message);
    }
  }

  await finalizeSlotAfterCheckout(parkingSession, mongoSession, parkingSession.exitTime);

  await logAudit(mongoSession, {
    actor: user._id,
    action: payload.forceCheckoutReason
      ? 'FORCE_VEHICLE_CHECKOUT'
      : payload.adjustedFee !== undefined && payload.adjustedFee !== null
        ? 'OVERRIDE_FEE_CALCULATION'
        : payload.bypassMismatch
          ? 'PLATE_MISMATCH_BYPASS'
          : 'PARKING_SESSION_CHECK_OUT',
    entityType: 'ParkingSession',
    entityId: `${parkingSession._id}`,
    building: parkingSession.building,
    after: parkingSession.toObject(),
    metadata: {
      paymentMethod: feeMethod,
      adjustedFee: payload.adjustedFee ?? null,
      adjustmentReason: payload.adjustmentReason || null,
      forceCheckoutReason: payload.forceCheckoutReason || null,
      bypassMismatch: Boolean(payload.bypassMismatch),
      staffShiftId: `${activeStaffShift._id}`,
      assignedGateId: activeStaffShift.gate?._id
        ? `${activeStaffShift.gate._id}`
        : activeStaffShift.gate
          ? `${activeStaffShift.gate}`
          : null,
    },
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

const checkOut = async (user, sessionId, payload = {}) => {
  const mongoSession = await mongoose.startSession();
  let postCommitEmail = null;
  try {
    const result = await mongoSession.withTransaction(async () => {
      const { parkingSession, payload: checkoutPayload, exitPlateImage, exitPortraitImage, activeStaffShift, exitGate } =
        await _verifyAndLoadSession(user, sessionId, payload, mongoSession);

      // Long-term subscription → separate flow with overage billing.
      if (parkingSession.paymentMethod === 'long_term') {
        postCommitEmail = await _handleLongTermCheckout(
          user,
          parkingSession,
          checkoutPayload,
          exitPlateImage,
          exitPortraitImage,
          activeStaffShift,
          exitGate,
          mongoSession,
        );
      } else {
        // Regular checkout (khách vãng lai / user thường).
        const { fee, feeMethod } = await _computeRegularFee(parkingSession, checkoutPayload, mongoSession);
        await _assertPayosCheckoutCanComplete(parkingSession, feeMethod, mongoSession);

        if (feeMethod === 'wallet' && fee > 0) {
          await _processWalletDebit(fee, parkingSession.user, parkingSession, mongoSession);
        }

        if (fee > 0) {
          await _createPaymentRecord(parkingSession, fee, feeMethod, user, checkoutPayload, mongoSession);
        }

        await _finalizeSession(
          user, parkingSession, checkoutPayload, fee, feeMethod,
          exitPlateImage, exitPortraitImage, activeStaffShift, exitGate, mongoSession,
        );
      }

      // Biển số này có đang bị 1 incident 'penalty_pending' (manager đã duyệt phí phạt)
      // chờ thu không? Nếu có → tạo Payment riêng cho phí phạt + resolve incident, ngay
      // trong transaction check-out này (staff là người thực thu tại cổng, không phải manager).
      await settlePendingPenaltyAtCheckout(user, parkingSession, checkoutPayload.paymentMethod || 'cash', mongoSession);

      return parkingSession;
    });

    // Email thông báo vượt giờ (ngoài transaction để lỗi gửi mail không rollback checkout).
    if (postCommitEmail) {
      try {
        const u = await User.findById(postCommitEmail.userId).select('email fullName');
        if (u?.email) {
          await sendNotificationEmail({
            to: u.email,
            fullName: u.fullName,
            subject: 'Vượt giờ đỗ tối đa/ngày của gói',
            heading: 'Vượt giờ đỗ tối đa/ngày',
            bodyHtml: `<p>${postCommitEmail.message}</p>`,
          });
        }
      } catch (e) {
        logger.error('[checkOut] overage email failed:', e.message);
      }
    }

    return result;
  } finally {
    mongoSession.endSession();
  }
};

module.exports = { checkOut };
