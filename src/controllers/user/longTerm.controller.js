const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/response');
const service = require('../../services/user/longTerm.service');

const listPackages = asyncHandler(async (req, res) => {
  const packages = await service.listPackages(req.query.buildingId);
  sendSuccess(res, { data: { packages } });
});

const getPackage = asyncHandler(async (req, res) => {
  const pkg = await service.getPackage(req.params.id);
  sendSuccess(res, { data: { package: pkg } });
});

const getSubscription = asyncHandler(async (req, res) => {
  const subscription = await service.getSubscription(req.user._id, req.params.id);
  sendSuccess(res, { data: { subscription } });
});

const subscribe = asyncHandler(async (req, res) => {
  const subscription = await service.subscribe(req.user._id, req.body);
  sendSuccess(res, { statusCode: 201, message: 'Subscription created', data: { subscription } });
});

const listSubscriptions = asyncHandler(async (req, res) => {
  const data = await service.listSubscriptions(req.user._id, req.query);
  sendSuccess(res, { data });
});

const cancelSubscription = asyncHandler(async (req, res) => {
  const { subscription, refundAmount, refundPercent } = await service.cancelSubscription(req.user._id, req.params.id, req.body);
  sendSuccess(res, { message: 'Subscription cancelled successfully', data: { subscription, refundAmount, refundPercent } });
});

const renewSubscription = asyncHandler(async (req, res) => {
  const subscription = await service.renewSubscription(req.user._id, req.params.id);
  sendSuccess(res, { message: 'Subscription renewed successfully', data: { subscription } });
});

module.exports = { listPackages, getPackage, subscribe, listSubscriptions, getSubscription, cancelSubscription, renewSubscription };
