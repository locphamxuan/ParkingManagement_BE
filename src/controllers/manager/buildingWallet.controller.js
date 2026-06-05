const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/response');
const service = require('../../services/manager/buildingWallet.service');
const topupService = require('../../services/manager/buildingWalletTopup.service');
const subscriptionService = require('../../services/manager/subscription.service');
const AdminSubscriptionPackage = require('../../models/finance/AdminSubscriptionPackage');
const AppError = require('../../utils/AppError');

const getWallet = asyncHandler(async (req, res) => {
  const wallet = await service.getOrCreate(req.params.buildingId);
  sendSuccess(res, { data: { wallet } });
});

const listTransactions = asyncHandler(async (req, res) => {
  const data = await service.listTransactions(req.params.buildingId, req.query);
  sendSuccess(res, { data });
});

const getDailyRevenue = asyncHandler(async (req, res) => {
  const data = await service.getDailyRevenue(req.params.buildingId, req.query.date);
  sendSuccess(res, { data });
});

// Manager subscribes to an admin package by transferring money from building wallet.
const subscribe = asyncHandler(async (req, res) => {
  const { buildingId } = req.params;
  const { packageId } = req.body;
  if (!packageId) throw new AppError('packageId is required', 400);

  const pkg = await AdminSubscriptionPackage.findOne({ _id: packageId, isActive: true });
  if (!pkg) throw new AppError('Subscription package not found or inactive', 404);

  const wallet = await service.manualTransferToAdmin(
    buildingId,
    pkg.price,
    req.user._id,
    pkg._id,
  );

  // Activate / extend the building's subscription so the dashboard unlocks.
  const subscription = await subscriptionService.recordSubscription(buildingId, req.user._id, pkg);

  sendSuccess(res, {
    message: `Successfully subscribed to "${pkg.name}". ${pkg.price.toLocaleString('en-US')} VND transferred to admin wallet. Active until ${subscription.endDate.toLocaleDateString('en-US')}.`,
    data: { wallet, package: pkg, subscription },
  });
});

// Building subscription status — used by the FE dashboard gate (NOT subscription-protected).
const getSubscriptionStatus = asyncHandler(async (req, res) => {
  const status = await subscriptionService.getStatus(req.params.buildingId);
  sendSuccess(res, { data: status });
});

// Managers can view available admin subscription packages to choose from.
const listSubscriptionPackages = asyncHandler(async (req, res) => {
  const packages = await AdminSubscriptionPackage.find({ isActive: true }).sort('price');
  sendSuccess(res, { data: { items: packages } });
});

// Initiate PayOS top-up for building wallet
const initiateTopup = asyncHandler(async (req, res) => {
  const { buildingId } = req.params;
  const { amount } = req.body;
  if (!amount) throw new AppError('amount is required', 400);
  const result = await topupService.topup(buildingId, req.user._id, Number(amount));
  sendSuccess(res, { data: result });
});

// Manually verify a PayOS top-up (fallback when webhook is delayed)
const verifyTopup = asyncHandler(async (req, res) => {
  const { orderCode } = req.params;
  const result = await topupService.verifyTopup(orderCode);
  sendSuccess(res, { data: result });
});

module.exports = {
  getWallet, listTransactions, getDailyRevenue,
  subscribe, listSubscriptionPackages, getSubscriptionStatus,
  initiateTopup, verifyTopup,
};
