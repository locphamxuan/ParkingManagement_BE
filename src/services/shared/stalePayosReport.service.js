const Payment = require('../../models/finance/Payment');

const { PAYMENT_TYPES } = Payment;
const SAMPLE_LIMIT = 50;

const referenceOf = (payment) => {
  // Chỉ nêu tham chiếu thực sự cần để đối soát, không dump cả bản ghi.
  const reference = {};
  if (payment.building) reference.buildingId = `${payment.building}`;
  if (payment.user) reference.userId = `${payment.user}`;
  if (payment.parkingSession) reference.parkingSessionId = `${payment.parkingSession}`;
  if (payment.subscription) reference.subscriptionId = `${payment.subscription}`;
  return reference;
};

/**
 * Báo cáo CHỈ ĐỌC các PayOS Payment còn 'pending' quá lâu — dấu hiệu webhook không
 * tới, user bỏ ngang, hoặc lời gọi PayOS lỗi mơ hồ. Không gọi PayOS, không đổi
 * trạng thái: quyết định đối soát là của người vận hành.
 */
const reportStalePayosPayments = async ({ olderThanMinutes, now = new Date() }) => {
  if (!Number.isInteger(olderThanMinutes) || olderThanMinutes <= 0) {
    throw new Error('olderThanMinutes must be a positive integer');
  }

  const cutoff = new Date(now.getTime() - olderThanMinutes * 60_000);
  const stale = await Payment.find({
    method: 'payos',
    status: 'pending',
    type: { $in: PAYMENT_TYPES },
    createdAt: { $lt: cutoff },
  })
    .select('_id payosOrderCode type amount createdAt building user parkingSession subscription')
    .sort({ createdAt: 1, _id: 1 })
    .lean();

  return {
    generatedAt: now.toISOString(),
    olderThanMinutes,
    cutoff: cutoff.toISOString(),
    total: stale.length,
    details: stale.slice(0, SAMPLE_LIMIT).map((payment) => ({
      paymentId: `${payment._id}`,
      payosOrderCode: payment.payosOrderCode ?? null,
      type: payment.type,
      amount: payment.amount,
      createdAt: new Date(payment.createdAt).toISOString(),
      ageMinutes: Math.floor((now.getTime() - new Date(payment.createdAt).getTime()) / 60_000),
      reference: referenceOf(payment),
    })),
  };
};

module.exports = { reportStalePayosPayments, SAMPLE_LIMIT };
