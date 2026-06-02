const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/response');
const service = require('../../services/manager/buildingWallet.service');

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

const listSettlements = asyncHandler(async (req, res) => {
  const data = await service.listSettlements(req.params.buildingId, req.query);
  sendSuccess(res, { data });
});

module.exports = { getWallet, listTransactions, getDailyRevenue, listSettlements };
