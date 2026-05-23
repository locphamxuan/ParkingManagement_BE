const AppError = require('../../utils/AppError');

const validateTopup = (req, _res, next) => {
  const { amount } = req.body;
  if (amount === undefined || amount === null) return next(new AppError('amount is required', 400));
  if (typeof amount !== 'number') return next(new AppError('amount must be a number', 400));
  if (amount <= 0) return next(new AppError('amount must be greater than 0', 400));
  next();
};

module.exports = { validateTopup };
