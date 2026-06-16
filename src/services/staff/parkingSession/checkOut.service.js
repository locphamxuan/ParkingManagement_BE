const mongoose = require('mongoose');
const logger = require("../../../utils/logger");
const AppError = require('../../../utils/AppError');
const {
  ParkingSession,
  ParkingSlot,
  Reservation,
  LongTermSubscription,
  Payment,
  WalletTransaction,
  User,
  Notification,
} = require('../../../models');
const { assertBuildingScope, logAudit } = require('../../../utils/staffScope');
const buildingWalletService = require('../../manager/buildingWallet.service');
const { normalizePlate } = require('../../../utils/plate.util');
const { calculateParkingFee } = require('../../../utils/feeCalculator');
const { computeDailyOverageHours } = require('../../../utils/longTermUsage');
const { getOverstayPenaltyPercent } = require('../../../utils/reservationHold');
const { sendNotificationEmail } = require('../../../utils/email');
const { DEFAULT_HOURLY_RATE } = require('../../../constants/pricing');
const { vehicleKindFromType } = require('./helpers');

const checkOut = async (user, sessionId, payload = {}) => {
  const mongoSession = await mongoose.startSession();
  let postCommitEmail = null; // gửi email sau khi transaction commit (best-effort)
  try {
    const result = await mongoSession.withTransaction(async () => {
      if (!sessionId) {
        throw new AppError('sessionId is required', 400, 'SESSION_ID_REQUIRED');
      }

      const parkingSession = await ParkingSession.findById(sessionId)
        .populate('reservation')
        .populate('vehicleType', 'code name')
        .populate({ path: 'slot', select: 'floor', populate: { path: 'floor', select: '_id' } })
        .session(mongoSession);
      if (!parkingSession) {
        throw new AppError('Parking session not found', 404, 'SESSION_NOT_FOUND');
      }

      assertBuildingScope(user, parkingSession.building);

      if (parkingSession.status !== 'active') {
        throw new AppError('Session not active', 400);
      }

      const providedPlate = normalizePlate(payload.plateNumber || payload.exitPlateNumber);
      if (providedPlate && providedPlate !== normalizePlate(parkingSession.plateNumber) && !payload.bypassMismatch) {
        throw new AppError('Plate mismatch requires bypass confirmation', 409, 'PLATE_MISMATCH_WARNING');
      }

      // Ảnh camera lúc RA (biển số + chân dung người lấy xe) để lưu bằng chứng/đối chiếu.
      const exitPlateImage = payload.exitPlateImage || null;
      const exitPortraitImage = payload.exitPortraitImage || null;

      // ── Session gói dài hạn ───────────────────────────────────────────────
      // Đỗ trong hạn mức giờ/ngày của gói → MIỄN PHÍ. Phần đỗ VƯỢT hạn mức/ngày
      // (cộng dồn theo ngày) bị tính phí theo PricePolicy thường (manager set) và
      // gửi thông báo cho user. Gói floating: nhả slot về 'available' khi xe rời.
      if (parkingSession.paymentMethod === 'long_term') {
        const now = new Date();

        // Hạn mức giờ/ngày lấy từ gói gắn với subscription (note: long_term:<id>).
        let maxHoursPerDay = 0;
        const subMatch = /long_term:([a-f\d]{24})/i.exec(parkingSession.note || '');
        if (subMatch) {
          const sub = await LongTermSubscription.findById(subMatch[1])
            .populate('package', 'maxHoursPerDay')
            .session(mongoSession);
          maxHoursPerDay = Number(sub?.package?.maxHoursPerDay || 0);
        }

        const overageHours = await computeDailyOverageHours({
          plateNumber: parkingSession.plateNumber,
          building: parkingSession.building,
          entryTime: parkingSession.entryTime,
          exitTime: now,
          excludeSessionId: parkingSession._id,
          maxHoursPerDay,
          session: mongoSession,
        });

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

          const [payment] = await Payment.create(
            [{
              building: parkingSession.building,
              parkingSession: parkingSession._id,
              type: 'session',
              method: feeMethod,
              amount: overageFee,
              status: 'success',
              user: parkingSession.user || null,
              staff: user._id,
              note: `long_term_overage:${overageHours.toFixed(2)}h`,
            }],
            { session: mongoSession },
          );

          await buildingWalletService.credit(
            parkingSession.building, overageFee, 'parking_fee', payment._id, mongoSession,
          );

          if (parkingSession.user) {
            const capMsg = maxHoursPerDay ? `${maxHoursPerDay}h/ngày` : 'gói';
            const message =
              `Xe ${parkingSession.plateNumber} đã đỗ vượt hạn mức ${capMsg}. ` +
              `Phần vượt ${overageHours.toFixed(1)} giờ được tính ${overageFee.toLocaleString('vi-VN')} VND theo giá thường.`;
            try {
              await Notification.create([{
                user: parkingSession.user,
                type: 'subscription_overage',
                title: 'Vượt giờ đỗ tối đa/ngày của gói',
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
        parkingSession.note = [
          parkingSession.note,
          overageHours > 0 ? `long_term_overage:${overageHours.toFixed(2)}h` : null,
          payload.bypassMismatch ? 'plate_mismatch_bypassed' : null,
        ].filter(Boolean).join(' | ');
        await parkingSession.save({ session: mongoSession });

        // Gói floating: nhả slot về 'available' khi xe rời (giống session thường).
        if (parkingSession.slot) {
          const ltSlotId = parkingSession.slot._id || parkingSession.slot;
          const ltSlot = await ParkingSlot.findById(ltSlotId).session(mongoSession);
          if (ltSlot && ltSlot.status !== 'maintenance') {
            ltSlot.status = 'available';
            await ltSlot.save({ session: mongoSession });
          }
        }

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
          },
        });

        return parkingSession;
      }

      const linkedReservation = parkingSession.reservation;
      const isReservationCheckout = Boolean(linkedReservation);

      let fee;
      let feeMethod;
      let walletUserId = null;

      if (isReservationCheckout) {
        // Thu phần CÒN LẠI = tổng phí đã ghi khi đặt − tiền cọc đã thu.
        // (cọc = depositPercent% do manager set; còn lại = 100 − depositPercent%).
        // Đặt bao nhiêu tiếng thu đủ bấy nhiêu — checkout sớm vẫn thu đủ tiền đã đặt.
        const estimatedFee = Number(linkedReservation.estimatedFee || 0);
        const deposit = Number(linkedReservation.fee || 0);
        fee = Math.max(0, estimatedFee - deposit);

        // OVERSTAY: đỗ quá endTime đã đặt → tính thêm phần vượt theo giá thường.
        const now = new Date();
        const endTime = linkedReservation.endTime ? new Date(linkedReservation.endTime) : null;
        if (endTime && now.getTime() > endTime.getTime()) {
          const vtId = parkingSession.vehicleType?._id || parkingSession.vehicleType || null;
          let overstayFee = await calculateParkingFee(parkingSession.building, vtId, endTime, now);
          if (!overstayFee || overstayFee <= 0) {
            const kind = vehicleKindFromType(parkingSession.vehicleType);
            const hours = Math.max(1, Math.ceil((now.getTime() - endTime.getTime()) / (1000 * 60 * 60)));
            overstayFee = hours * (DEFAULT_HOURLY_RATE[kind] || DEFAULT_HOURLY_RATE.car);
          }
          // Phụ phí PHẠT overstay (manager cấu hình) — CHỈ áp lên phần vượt giờ.
          const penaltyPercent = await getOverstayPenaltyPercent(parkingSession.building, mongoSession);
          if (penaltyPercent > 0) {
            overstayFee = Math.ceil(overstayFee * (1 + penaltyPercent / 100));
          }
          fee += overstayFee;
        }

        // Thanh toán phần còn lại: staff chọn cash/payos/wallet (mặc định wallet).
        feeMethod = payload.paymentMethod || 'wallet';
        walletUserId = linkedReservation.user;
      } else {
        feeMethod = payload.paymentMethod || 'cash';
        fee = Number(parkingSession.fee || 0);
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
      }

      // Debit user wallet for reservation checkouts (remaining fee) or direct wallet payments.
      if (feeMethod === 'wallet' && fee > 0) {
        const targetUserId = walletUserId || parkingSession.user;
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
            reason: isReservationCheckout ? 'reservation_checkout' : 'parking_checkout',
            metadata: isReservationCheckout
              ? { sessionId: `${parkingSession._id}`, reservationId: `${linkedReservation._id}`, reservationCode: linkedReservation.code }
              : { sessionId: `${parkingSession._id}` },
          }],
          { session: mongoSession },
        );
      }

      const [payment] = await Payment.create(
        [{
          building: parkingSession.building,
          parkingSession: parkingSession._id,
          reservation: isReservationCheckout ? linkedReservation._id : null,
          type: 'session',
          method: feeMethod,
          amount: fee,
          status: 'success',
          user: (walletUserId || parkingSession.user) || null,
          staff: user._id,
          note: [
            isReservationCheckout ? `reservation_remaining:${linkedReservation.code}` : null,
            payload.adjustmentReason,
            payload.forceCheckoutReason,
          ].filter(Boolean).join(' | '),
        }],
        { session: mongoSession },
      );

      if (fee > 0) {
        await buildingWalletService.credit(
          parkingSession.building,
          fee,
          isReservationCheckout ? 'reservation_fee' : 'parking_fee',
          payment._id,
          mongoSession,
        );
      }

      // Mark linked reservation as completed.
      if (isReservationCheckout) {
        await Reservation.findByIdAndUpdate(
          linkedReservation._id,
          { status: 'completed' },
          { session: mongoSession },
        );
      }

      parkingSession.exitTime = new Date();
      parkingSession.status = 'completed';
      parkingSession.fee = fee;
      parkingSession.paymentMethod = feeMethod;
      parkingSession.exitPlateImage = exitPlateImage;
      parkingSession.exitPortraitImage = exitPortraitImage;
      parkingSession.note = [parkingSession.note, payload.forceCheckoutReason, payload.bypassMismatch ? 'plate_mismatch_bypassed' : null]
        .filter(Boolean)
        .join(' | ');
      await parkingSession.save({ session: mongoSession });

      if (parkingSession.slot) {
        const slot = await ParkingSlot.findById(parkingSession.slot).session(mongoSession);
        if (slot && slot.status !== 'maintenance') {
          slot.status = 'available';
          await slot.save({ session: mongoSession });
        }
      }

      await logAudit(mongoSession, {
        actor: user._id,
        action: isReservationCheckout
          ? 'RESERVATION_CHECK_OUT'
          : payload.forceCheckoutReason
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
          isReservationCheckout,
          reservationId: isReservationCheckout ? `${linkedReservation._id}` : null,
          adjustedFee: payload.adjustedFee ?? null,
          adjustmentReason: payload.adjustmentReason || null,
          forceCheckoutReason: payload.forceCheckoutReason || null,
          bypassMismatch: Boolean(payload.bypassMismatch),
        },
      });

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
