const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/response');
const service = require('../../services/user/wallet.service');

const getWallet = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: { walletBalance: req.user.walletBalance } });
});

const topup = asyncHandler(async (req, res) => {
  const data = await service.topup(req.user._id, req.body.amount);
  sendSuccess(res, { message: 'Top-up successful', data });
});

const listTransactions = asyncHandler(async (req, res) => {
  const data = await service.listTransactions(req.user._id, req.query);
  sendSuccess(res, { data });
});

module.exports = { getWallet, topup, listTransactions };
