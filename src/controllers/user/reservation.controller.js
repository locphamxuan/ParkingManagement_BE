const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/response');
const service = require('../../services/user/reservation.service');

const list = asyncHandler(async (req, res) => {
  const data = await service.list(req.user._id, req.query);
  sendSuccess(res, { data });
});

const get = asyncHandler(async (req, res) => {
  const reservation = await service.get(req.user._id, req.params.id);
  sendSuccess(res, { data: { reservation } });
});

const create = asyncHandler(async (req, res) => {
  const result = await service.create(req.user._id, req.body);
  // result: { reservation, paymentRequired?, fee?, checkoutUrl?, orderCode? }
  sendSuccess(res, { statusCode: 201, message: 'Reservation created', data: result });
});

const cancel = asyncHandler(async (req, res) => {
  const { reservation, refund, amountPaid } = await service.cancel(req.user._id, req.params.id);
  sendSuccess(res, {
    message: refund > 0
      ? `Reservation cancelled — ${refund.toLocaleString('en-US')} VND (85%) refunded to your wallet`
      : 'Reservation cancelled',
    data: { reservation, refund, amountPaid },
  });
});

module.exports = { list, get, create, cancel };
