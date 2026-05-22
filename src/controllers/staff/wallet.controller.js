const asyncHandler = require("../../utils/asyncHandler");
const { sendSuccess } = require("../../utils/response");
const walletService = require("../../services/staff/wallet.service");

const processWalletTransaction = asyncHandler(async (req, res) => {
  const { sessionId, userId, amount } = req.body;
  const staffId = req.user._id;

  const result = await walletService.processWalletTransaction({
    sessionId,
    userId,
    amount,
    staffId
  });

  sendSuccess(res, "Thanh toán qua ví nội bộ thành công", result);
});

module.exports = {
  processWalletTransaction,
};