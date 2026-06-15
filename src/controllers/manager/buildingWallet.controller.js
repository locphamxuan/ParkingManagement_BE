const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/response');
const service = require('../../services/manager/buildingWallet.service');
const topupService = require('../../services/manager/buildingWalletTopup.service');
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
  initiateTopup, verifyTopup,
};
