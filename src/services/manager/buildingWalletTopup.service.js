const mongoose = require('mongoose');
const BuildingWallet = require('../../models/finance/BuildingWallet');
const BuildingWalletTransaction = require('../../models/finance/BuildingWalletTransaction');
const Payment = require('../../models/finance/Payment');
const AppError = require('../../utils/AppError');
const payosService = require('../payment/payos.service');
const env = require('../../config/env');

const MIN_TOPUP = 2_000;

/**
 * Initiate a PayOS top-up for the building wallet.
 * Returns { checkoutUrl, qrCode, orderCode }.
 */
const topup = async (buildingId, managerId, amount) => {
  if (!amount || amount <= 0) throw new AppError('amount must be greater than 0', 400);
  if (!Number.isInteger(amount)) throw new AppError('amount must be an integer (VND)', 400);
  if (amount < MIN_TOPUP) throw new AppError(`Minimum top-up is ${MIN_TOPUP.toLocaleString('en-US')} ₫`, 400);

  const orderCode = payosService.generateOrderCode();
  const returnUrl = `${env.clientUrl}/manager/wallet?topup=success&orderCode=${orderCode}`;
  const cancelUrl = `${env.clientUrl}/manager/wallet?topup=cancel`;

  const { checkoutUrl, qrCode, paymentLinkId } = await payosService.createPaymentLink({
    orderCode,
    amount,
    description: 'Nap vi toa nha PBMS',
    returnUrl,
    cancelUrl,
  });

  await Payment.create({
    building: buildingId,
    type: 'topup',
    method: 'payos',
    amount,
    status: 'pending',
    user: managerId,
    payosOrderCode: orderCode,
    payosPaymentLinkId: paymentLinkId,
    note: 'Building wallet top-up via PayOS',
  });

  return { checkoutUrl, qrCode, orderCode };
};

/**
 * Settle a successful PayOS top-up into the building wallet — idempotent.
 * Called by webhook and manual verify endpoint.
 */
const settleTopup = async (orderCode) => {
  const oc = Number(orderCode);
  const mongoSession = await mongoose.startSession();
  let result = { credited: false, status: 'already_processed', balance: null, amount: 0 };
  try {
    await mongoSession.withTransaction(async () => {
      const payment = await Payment.findOneAndUpdate(
        { payosOrderCode: oc, type: 'topup', status: 'pending' },
        { status: 'success' },
        { new: true, session: mongoSession },
      );
      if (!payment) return;

      const amount = payment.amount;
      const buildingId = payment.building;

      const wallet = await BuildingWallet.findOneAndUpdate(
        { building: buildingId },
        { $inc: { balance: amount, totalReceived: amount } },
        { new: true, upsert: true, session: mongoSession },
      );

      await BuildingWalletTransaction.create(
        [{
          building: buildingId,
          type: 'credit',
          amount,
          balanceAfter: wallet.balance,
          reason: 'topup',
          relatedPayment: payment._id,
        }],
        { session: mongoSession },
      );

      result = { credited: true, status: 'success', balance: wallet.balance, amount };
    });
    return result;
  } finally {
    mongoSession.endSession();
  }
};

/**
 * Manually verify a PayOS top-up order — fallback when webhook doesn't reach server.
 */
const verifyTopup = async (orderCode) => {
  const oc = Number(orderCode);
  if (!oc) throw new AppError('Invalid orderCode', 400);

  const payment = await Payment.findOne({ payosOrderCode: oc, type: 'topup' });
  if (!payment) throw new AppError('Payment order not found', 404);

  if (payment.status === 'success') return { status: 'success', credited: false };

  let info;
  try {
    info = await payosService.getPaymentLink(oc);
  } catch (err) {
    throw new AppError(`Could not verify with PayOS: ${err.message}`, 502);
  }

  const payosStatus = String(info?.status || '').toUpperCase();
  if (payosStatus === 'PAID') {
    const r = await settleTopup(oc);
    return { status: 'success', credited: r.credited };
  }
  return { status: payosStatus.toLowerCase() || 'pending', credited: false };
};

module.exports = { topup, settleTopup, verifyTopup };
