const mongoose = require('mongoose');
const { Reservation, ParkingSlot, User, Payment, WalletTransaction, ReservationPolicy } = require('../models');
const buildingWalletService = require('./manager/buildingWallet.service');

/**
 * NGUỒN DUY NHẤT cho nghiệp vụ "reservation hết hạn (no-show)".
 *
 * Trước đây có 3 đường code đánh dấu expired với hành vi tiền LỆCH nhau:
 *  - job reservationExpiry: hoàn refundPercent% cọc ✔
 *  - resolveReservation (check-in bằng biển số): KHÔNG hoàn ✘
 *  - staff expireReservation (thao tác tay): KHÔNG hoàn ✘
 * → user được/mất tiền tùy đường code chạy trước. Hàm này gom về một chỗ:
 * đánh dấu expired (atomic, chỉ 1 caller thắng) + thả slot (không đụng slot
 * bảo trì) + hoàn refundPercent% cọc theo chính sách tòa nhà.
 *
 * @param {string|ObjectId} reservationId
 * @returns {Promise<{reservation:Object, refundAmount:number, refundPercent:number}|null>}
 *          null nếu reservation không còn ở trạng thái pending/confirmed
 *          (đã được xử lý bởi caller khác — idempotent).
 */
const expireReservationWithRefund = async (reservationId) => {
  const mongoSession = await mongoose.startSession();
  try {
    let outcome = null;
    await mongoSession.withTransaction(async () => {
      // Claim atomic: chỉ một caller flip được pending/confirmed → expired.
      const reservation = await Reservation.findOneAndUpdate(
        { _id: reservationId, status: { $in: ['pending', 'confirmed'] } },
        { $set: { status: 'expired' } },
        { new: true, session: mongoSession },
      );
      if (!reservation) {
        outcome = null;
        return;
      }

      // Thả slot nếu có giữ (không đụng slot đang bảo trì).
      const slotId = reservation.slot?._id || reservation.slot || null;
      if (slotId) {
        await ParkingSlot.updateOne(
          { _id: slotId, status: { $ne: 'maintenance' } },
          { $set: { status: 'available' } },
          { session: mongoSession },
        );
      }

      // Hoàn refundPercent% cọc theo chính sách tòa nhà (0 = mất toàn bộ cọc).
      const buildingId = reservation.building?._id || reservation.building;
      const policy = await ReservationPolicy.findOne({ building: buildingId })
        .select('refundPercent')
        .session(mongoSession);
      const refundPercent = Math.min(Math.max(Number(policy?.refundPercent ?? 0), 0), 100);
      const deposit = Number(reservation.fee || 0);
      const refundAmount = Math.round((deposit * refundPercent) / 100);

      if (refundAmount > 0 && reservation.user) {
        const updatedUser = await User.findByIdAndUpdate(
          reservation.user,
          { $inc: { walletBalance: refundAmount } },
          { new: true, session: mongoSession },
        );
        if (updatedUser) {
          await WalletTransaction.create([{
            user: reservation.user,
            type: 'credit',
            amount: refundAmount,
            balanceAfter: updatedUser.walletBalance,
            status: 'success',
            reason: 'reservation_refund',
            metadata: {
              reservationId: `${reservation._id}`,
              code: reservation.code,
              percent: refundPercent,
              reason: 'expired',
            },
          }], { session: mongoSession });

          const [refundPayment] = await Payment.create([{
            building: buildingId,
            reservation: reservation._id,
            type: 'refund',
            method: 'wallet',
            amount: refundAmount,
            status: 'success',
            user: reservation.user,
            note: `Reservation ${reservation.code} expired — ${refundPercent}% partial refund`,
          }], { session: mongoSession });

          await buildingWalletService.debit(
            buildingId, refundAmount, 'refund', refundPayment._id, null, mongoSession,
            { allowNegative: true },
          );
        }
      }

      outcome = { reservation, refundAmount, refundPercent };
    });
    return outcome;
  } finally {
    await mongoSession.endSession();
  }
};

module.exports = { expireReservationWithRefund };
