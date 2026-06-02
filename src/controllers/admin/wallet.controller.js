const asyncHandler = require("../../utils/asyncHandler");
const { sendSuccess } = require("../../utils/response");
const service = require("../../services/admin/wallet.service");

const getWallet = asyncHandler(async (_req, res) => {
  const wallet = await service.getWallet();
  sendSuccess(res, { data: { wallet } });
});

const topup = asyncHandler(async (req, res) => {
  const wallet = await service.topup(req.body.amount);
  sendSuccess(res, { message: "Wallet topped up", data: { wallet } });
});

const distribute = asyncHandler(async (req, res) => {
  const { buildingId, amount, periodStart, periodEnd, note } = req.body;
  const result = await service.distribute({
    buildingId,
    amount,
    periodStart,
    periodEnd,
    note,
    actor: req.user,
  });
  sendSuccess(res, {
    statusCode: 201,
    message: "Revenue distributed successfully",
    data: result,
  });
});

const listDistributions = asyncHandler(async (req, res) => {
  const data = await service.listDistributions(req.query);
  sendSuccess(res, { data });
});

const getDailyTransfers = asyncHandler(async (req, res) => {
  const data = await service.getDailyTransfers(req.query);
  sendSuccess(res, { data });
});

module.exports = { getWallet, topup, distribute, listDistributions, getDailyTransfers };
