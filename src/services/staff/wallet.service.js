const mongoose = require('mongoose');
const AppError = require('../../utils/AppError');
const {
  User,
  WalletTransaction,
  ParkingSession,
  AuditLog,
} = require('../../models');

const toIdString = (value) => `${value?._id || value}`;

const logAudit = async (session, payload) =>
  AuditLog.create([
    {
      actor: payload.actor,
      actorRole: payload.actorRole || null,
      action: payload.action,
      targetTable: payload.entityType,
      targetId: payload.entityId || null,
      building: payload.building || null,
      previousValue: payload.before || null,
      newValue: payload.after || null,
      severity: payload.severity || 'low',
      description: payload.description || '',
    },
  ], { session });

const processWalletTransaction = async (staffUser, payload = {}) => {
  const session = await mongoose.startSession();
  try {
    const result = await session.withTransaction(async () => {
      const amount = Number(payload.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new AppError('amount must be a positive number', 400, 'INVALID_AMOUNT');
      }

      let targetUserId = payload.userId || payload.walletUserId || null;
      let parkingSession = null;

      if (payload.parkingSessionId) {
        parkingSession = await ParkingSession.findById(payload.parkingSessionId).session(session);
        if (!parkingSession) {
          throw new AppError('Parking session not found', 404, 'SESSION_NOT_FOUND');
        }
        targetUserId = targetUserId || toIdString(parkingSession.user);
      }

      if (!targetUserId) {
        throw new AppError('walletUserId is required', 400, 'WALLET_USER_REQUIRED');
      }

      const user = await User.findById(targetUserId).session(session);
      if (!user) {
        throw new AppError('User not found', 404, 'USER_NOT_FOUND');
      }

      const currentBalance = Number(user.walletBalance || 0);
      if (currentBalance < amount) {
        throw new AppError('Insufficient wallet balance', 409, 'INSUFFICIENT_WALLET_BALANCE');
      }

      user.walletBalance = currentBalance - amount;
      await user.save({ session });

      const transaction = await WalletTransaction.create([
        {
          user: user._id,
          payment: payload.paymentId || null,
          type: 'debit',
          amount,
          balanceAfter: user.walletBalance,
          status: 'success',
          reason: payload.reason || 'parking_checkout',
          metadata: {
            parkingSessionId: payload.parkingSessionId || null,
            staffId: staffUser._id,
            note: payload.note || '',
          },
        },
      ], { session });

      await logAudit(session, {
        actor: staffUser._id,
        action: 'WALLET_TRANSACTION_PAYMENT',
        entityType: 'WalletTransaction',
        entityId: `${transaction[0]._id}`,
        building: payload.buildingId || parkingSession?.building || null,
        before: { walletBalance: currentBalance },
        after: { walletBalance: user.walletBalance, amount },
        severity: 'medium',
        description: payload.description || 'Wallet debit for checkout/payment',
      });

      return {
        user,
        walletTransaction: transaction[0],
      };
    });

    return result;
  } finally {
    session.endSession();
  }
};

module.exports = { processWalletTransaction };
