// middlewares/errorHandler.js
module.exports = function errorHandler(err, _req, res, _next) {
    console.error('Unhandled error:', err);
    const code = err.status || 500;
    const payload = {
      error: err.code || 'INTERNAL_ERROR',
      message: err.message || 'Something went wrong',
    };
    if (process.env.NODE_ENV !== 'production' && err.stack) {
      payload.stack = err.stack;
    }
    res.status(code).json(payload);
  };
  