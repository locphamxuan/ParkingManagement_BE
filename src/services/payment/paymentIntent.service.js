const AppError = require('../../utils/AppError');
const { Payment } = require('../../models');
const payosService = require('./payos.service');

const MAX_ORDER_CODE_ATTEMPTS = 5;

const linkPayload = (payment) => ({
  checkoutUrl: payment.payosCheckoutUrl,
  qrCode: payment.payosQrCode,
  paymentLinkId: payment.payosPaymentLinkId,
  orderCode: payment.payosOrderCode,
  amount: payment.amount,
});

const persistLink = async (paymentId, link) => Payment.findByIdAndUpdate(
  paymentId,
  {
    $set: {
      payosPaymentLinkId: link.paymentLinkId || null,
      payosCheckoutUrl: link.checkoutUrl || null,
      payosQrCode: link.qrCode || null,
    },
  },
  { new: true },
);

const createPendingPayment = async (paymentData) => {
  for (let attempt = 0; attempt < MAX_ORDER_CODE_ATTEMPTS; attempt += 1) {
    const orderCode = payosService.generateOrderCode();
    try {
      return await Payment.create({
        ...paymentData,
        status: 'pending',
        method: 'payos',
        payosOrderCode: orderCode,
      });
    } catch (error) {
      if (error?.code !== 11000 || !error?.keyPattern?.payosOrderCode) throw error;
    }
  }
  throw new AppError('Could not allocate a unique PayOS order code', 503, 'PAYOS_ORDER_CODE_EXHAUSTED');
};

const isDefinitiveFailure = (error) => {
  const status = Number(error?.statusCode || error?.response?.status || 0);
  return status >= 400 && status < 500 && ![408, 429].includes(status);
};

const createPayosIntent = async ({ paymentData, linkData }) => {
  const payment = await createPendingPayment(paymentData);
  const orderCode = payment.payosOrderCode;

  try {
    const link = await payosService.createPaymentLink({ ...linkData, orderCode });
    const saved = await persistLink(payment._id, link);
    return { payment: saved, ...linkPayload(saved), ...link };
  } catch (createError) {
    try {
      const existingLink = await payosService.getPaymentLink(orderCode);
      if (existingLink) {
        const saved = await persistLink(payment._id, existingLink);
        return { payment: saved, ...linkPayload(saved), ...existingLink };
      }
    } catch (_reconcileError) {
      // The original create error determines whether the intent is failed or uncertain.
    }

    if (isDefinitiveFailure(createError)) {
      await Payment.updateOne(
        { _id: payment._id, status: 'pending' },
        { $set: { status: 'failed' } },
      );
    } else {
      await Payment.updateOne(
        { _id: payment._id, status: 'pending' },
        { $set: { note: `${payment.note || ''} | payos_create_uncertain`.trim() } },
      );
    }
    throw new AppError(
      `Could not create PayOS payment link: ${createError.message}`,
      502,
      isDefinitiveFailure(createError) ? 'PAYOS_CREATE_FAILED' : 'PAYOS_CREATE_UNCERTAIN',
    );
  }
};

const getPendingSessionIntent = async (parkingSessionId) => {
  const payment = await Payment.findOne({
    parkingSession: parkingSessionId,
    type: 'session',
    method: 'payos',
    status: 'pending',
  }).sort({ createdAt: -1 });
  if (!payment) return null;

  try {
    const link = await payosService.getPaymentLink(payment.payosOrderCode);
    const status = String(link?.status || '').toUpperCase();
    if (status === 'EXPIRED' || status === 'CANCELLED') {
      await Payment.updateOne(
        { _id: payment._id, status: 'pending' },
        { $set: { status: 'failed', note: `${payment.note || ''} | payos_link_${status.toLowerCase()}`.trim() } },
      );
      return null;
    }

    const saved = link?.checkoutUrl ? await persistLink(payment._id, link) : payment;
    return { payment: saved, ...linkPayload(saved), ...link };
  } catch (error) {
    throw new AppError(
      `Could not recover pending PayOS payment: ${error.message}`,
      502,
      'PAYOS_PENDING_INTENT_UNAVAILABLE',
    );
  }
};

module.exports = { createPayosIntent, getPendingSessionIntent };
