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

const getRevenueBreakdown = asyncHandler(async (req, res) => {
  const data = await service.getRevenueBreakdown(req.params.buildingId, {
    from: req.query.from,
    to: req.query.to,
  });
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
  const { buildingId, orderCode } = req.params;
  const result = await topupService.verifyTopup(buildingId, orderCode);
  sendSuccess(res, { data: result });
});

// Tiền mặt chờ xác nhận
const listPendingCash = asyncHandler(async (req, res) => {
  const data = await service.listPendingCash(req.params.buildingId, req.query);
  sendSuccess(res, { data });
});

// Manager "Thu nhận" 1 khoản tiền mặt → cộng vào ví building
const confirmCash = asyncHandler(async (req, res) => {
  const payment = await service.confirmCash(req.params.buildingId, req.params.paymentId, req.user._id);
  sendSuccess(res, { message: 'Đã thu nhận khoản tiền mặt vào ví tòa nhà', data: { payment } });
});

// Toàn bộ dòng tiền (Payment) của building theo phương thức/trạng thái
const listPayments = asyncHandler(async (req, res) => {
  const data = await service.listPayments(req.params.buildingId, req.query);
  sendSuccess(res, { data });
});

// Doanh thu tiền phạt vi phạm
const getPenaltyRevenue = asyncHandler(async (req, res) => {
  const data = await service.getPenaltyRevenue(req.params.buildingId);
  sendSuccess(res, { data });
});

module.exports = {
  getWallet, listTransactions, getDailyRevenue, getRevenueBreakdown,
  initiateTopup, verifyTopup,
  listPendingCash, confirmCash, listPayments,
  getPenaltyRevenue,
};
