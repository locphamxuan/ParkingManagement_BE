const logger = require("../utils/logger");
const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

const errorHandler = (err, req, res, _next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';

  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors)
      .map((e) => e.message)
      .join('. ');
  }

  if (err.code === 11000) {
    statusCode = 409;
    // Với unique index ghép (vd {building, code}), 'building' không phải field gây trùng
    // thực sự — bỏ qua nó để nêu đúng field (code/name/...). Message thân thiện hơn.
    const keys = Object.keys(err.keyValue || {});
    const field = keys.find((k) => k !== 'building') || keys[0] || 'value';
    message = `A record with this ${field} already exists`;
  }

  if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid resource ID';
  }

  if (process.env.NODE_ENV === 'development') {
    logger.error('[Error]', err);
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(err.errorCode && { errorCode: err.errorCode }),
    ...(err.details && { details: err.details }),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

module.exports = { notFound, errorHandler };
