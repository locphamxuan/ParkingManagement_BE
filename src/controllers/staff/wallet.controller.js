const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/response');
const walletService = require('../../services/staff/wallet.service');

const processWalletTransaction = asyncHandler(async (req, res) => {
  const result = await walletService.processWalletTransaction(req.user, {
    parkingSessionId: req.body.sessionId,
    userId: req.body.userId,
    amount: req.body.amount,
  });
  sendSuccess(res, { message: 'Thanh toán qua ví nội bộ thành công', data: result });
});

module.exports = { processWalletTransaction };
