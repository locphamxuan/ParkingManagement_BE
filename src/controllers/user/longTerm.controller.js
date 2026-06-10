const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/response');
const service = require('../../services/user/longTerm.service');

const listPackages = asyncHandler(async (req, res) => {
  const packages = await service.listPackages(req.query.buildingId);
  sendSuccess(res, { data: { packages } });
});

const subscribe = asyncHandler(async (req, res) => {
  const result = await service.subscribe(req.user._id, req.body);
  sendSuccess(res, {
    statusCode: 201,
    message: result.checkoutUrl ? 'Redirecting to payment' : 'Subscription created',
    data: result,
  });
});

const listSubscriptions = asyncHandler(async (req, res) => {
  const data = await service.listSubscriptions(req.user._id, req.query);
  sendSuccess(res, { data });
});

module.exports = { listPackages, subscribe, listSubscriptions };
