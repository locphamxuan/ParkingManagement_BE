const User = require('../../models/user/User');
const WalletTransaction = require('../../models/finance/WalletTransaction');
const AppError = require('../../utils/AppError');

const topup = async (userId, amount) => {
  if (!amount || amount <= 0) throw new AppError('amount must be greater than 0', 400);

  const user = await User.findByIdAndUpdate(
    userId,
    { $inc: { walletBalance: amount } },
    { new: true }
  ).select('walletBalance');
  if (!user) throw new AppError('User not found', 404);

  const transaction = await WalletTransaction.create({
    user: userId,
    type: 'credit',
    amount,
    balanceAfter: user.walletBalance,
    status: 'success',
    reason: 'user_topup',
  });

  return { walletBalance: user.walletBalance, transaction };
};

const listTransactions = async (userId, query = {}) => {
  const filter = { user: userId };
  if (query.type) filter.type = query.type;

  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);

  const [items, total] = await Promise.all([
    WalletTransaction.find(filter)
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(limit),
    WalletTransaction.countDocuments(filter),
  ]);

  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

module.exports = { topup, listTransactions };
