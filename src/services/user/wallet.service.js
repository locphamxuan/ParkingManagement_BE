const mongoose = require('mongoose');
const User = require('../../models/user/User');
const WalletTransaction = require('../../models/finance/WalletTransaction');
const Payment = require('../../models/finance/Payment');
const AppError = require('../../utils/AppError');
const payosService = require('../payment/payos.service');
const { createPayosIntent } = require('../payment/paymentIntent.service');
const env = require('../../config/env');

// PayOS / VND minimum: 2,000 ₫ (PayOS minimum is 2,000 VND)
const MIN_TOPUP = 2_000;

/**
 * Initiate a wallet top-up via PayOS.
 *
 * Flow:
 *  1. Generate a unique orderCode
 *  2. Create a pending Payment record in DB (idempotency anchor)
 *  3. Create PayOS payment link → get checkoutUrl + qrCode
 *  4. Return { checkoutUrl, qrCode, orderCode } to client
 *
 * Balance is credited ONLY after the PayOS webhook fires (payment confirmed).
 */
const topup = async (userId, amount) => {
  if (!amount || amount <= 0) throw new AppError('amount must be greater than 0', 400);
  if (!Number.isInteger(amount)) throw new AppError('amount must be an integer (VND, no decimals)', 400);
  if (amount < MIN_TOPUP) throw new AppError(`Minimum top-up is ${MIN_TOPUP.toLocaleString('vi-VN')} ₫`, 400);

  const user = await User.findById(userId).select('_id email fullName');
  if (!user) throw new AppError('User not found', 404);

  const returnUrl = `${env.clientUrl}/wallet/topup/success`;
  const cancelUrl = `${env.clientUrl}/wallet/topup/cancel`;

  const {
    checkoutUrl,
    qrCode,
    orderCode,
    paymentLinkId,
    bin,
    accountNumber,
    accountName,
    description: payosDescription,
  } = await createPayosIntent({
    paymentData: {
      type: 'topup',
      amount,
      user: userId,
      note: 'Wallet top-up via PayOS',
    },
    linkData: {
      amount,
      description: 'Nap vi PBMS',
      buyerName: user.fullName,
      buyerEmail: user.email,
      returnUrl,
      cancelUrl,
    },
  });

  return {
    checkoutUrl,
    qrCode,
    orderCode,
    bin,
    accountNumber,
    accountName,
    description: payosDescription,
    amount,
  };
};

const listTransactions = async (userId, query = {}) => {
  const filter = { user: userId };
  if (query.type) filter.type = query.type;

  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);

  const [items, total] = await Promise.all([
    WalletTransaction.find(filter)
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(limit),
    WalletTransaction.countDocuments(filter),
  ]);

  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

/**
 * Credit a successful PayOS top-up to the user's wallet — race-safe & idempotent.
 *
 * Used by BOTH the PayOS webhook and the manual verify endpoint. Idempotency is
 * guaranteed by atomically flipping the Payment from 'pending' → 'success': only
 * the caller that wins that flip performs the credit, so the wallet can never be
 * credited twice for the same order (webhook + verify, or concurrent verifies).
 *
 * Always credits `payment.amount` (our own record), never an externally reported
 * value — PayOS only marks an order PAID once the full requested amount is paid.
 *
 * @param {number} orderCode - PayOS order code
 * @returns {Promise<{credited: boolean, status: string, balance: number|null, amount: number}>}
 */
const settleTopup = async (orderCode) => {
  const oc = Number(orderCode);
  const mongoSession = await mongoose.startSession();
  let result = { credited: false, status: 'already_processed', balance: null, amount: 0 };
  try {
    await mongoSession.withTransaction(async () => {
      // Atomic claim — only one caller flips pending → success.
      const payment = await Payment.findOneAndUpdate(
        { payosOrderCode: oc, type: 'topup', status: 'pending' },
        { status: 'success' },
        { new: true, session: mongoSession },
      );
      if (!payment) return; // already processed (or unknown) → no-op

      const amount = payment.amount;
      const user = await User.findByIdAndUpdate(
        payment.user,
        { $inc: { walletBalance: amount } },
        { new: true, session: mongoSession },
      );
      if (!user) throw new AppError(`User ${payment.user} not found`, 404);

      await WalletTransaction.create(
        [{
          user: payment.user,
          type: 'credit',
          amount,
          balanceAfter: user.walletBalance,
          status: 'success',
          reason: 'payos_topup',
          metadata: { payosOrderCode: oc },
        }],
        { session: mongoSession },
      );

      result = { credited: true, status: 'success', balance: user.walletBalance, amount };
    });
    return result;
  } finally {
    mongoSession.endSession();
  }
};

/**
 * Reconcile a top-up by asking PayOS for its real status — fallback for when the
 * webhook never reaches the server. If PayOS reports PAID and the order is still
 * pending, credit the wallet (via settleTopup, so it stays idempotent).
 *
 * @param {string|ObjectId} userId
 * @param {number|string} orderCode
 * @returns {Promise<{status: string, credited: boolean, balance: number}>}
 */
const verifyTopup = async (userId, orderCode) => {
  const oc = Number(orderCode);
  if (!oc) throw new AppError('Invalid orderCode', 400);

  const payment = await Payment.findOne({ payosOrderCode: oc, type: 'topup', user: userId });
  if (!payment) throw new AppError('Top-up order not found', 404);

  const user = await User.findById(userId).select('walletBalance');
  if (payment.status === 'success') {
    return { status: 'success', credited: false, balance: user.walletBalance };
  }

  // Ask PayOS for the authoritative status
  let info;
  try {
    info = await payosService.getPaymentLink(oc);
  } catch (err) {
    throw new AppError(`Could not verify payment with PayOS: ${err.message}`, 502);
  }

  const payosStatus = String(info?.status || '').toUpperCase();
  if (payosStatus === 'PAID') {
    const settled = await settleTopup(oc);
    const fresh = await User.findById(userId).select('walletBalance');
    return { status: 'success', credited: settled.credited, balance: fresh.walletBalance };
  }

  // PENDING / PROCESSING / CANCELLED / EXPIRED — nothing to credit yet
  return { status: payosStatus.toLowerCase() || 'pending', credited: false, balance: user.walletBalance };
};

module.exports = { topup, listTransactions, settleTopup, verifyTopup };
