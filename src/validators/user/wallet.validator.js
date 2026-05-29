const AppError = require('../../utils/AppError');

const MIN_TOPUP = 2_000; // VND — PayOS minimum

const validateTopup = (req, _res, next) => {
  const { amount } = req.body;
  if (amount === undefined || amount === null) return next(new AppError('amount is required', 400));
  if (typeof amount !== 'number') return next(new AppError('amount must be a number', 400));
  if (!Number.isInteger(amount)) return next(new AppError('amount must be an integer (VND, no decimals)', 400));
  if (amount < MIN_TOPUP) return next(new AppError(`Minimum top-up is ${MIN_TOPUP.toLocaleString('vi-VN')} ₫`, 400));
  next();
};

module.exports = { validateTopup };
