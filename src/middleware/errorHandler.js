const config = require('../config');

/**
 * Global Express error handling middleware.
 * Ensures consistent JSON error envelopes and prevents HTML stack traces from leaking.
 */
function errorHandler(err, req, res, next) {
  // Handle body-parser JSON parse errors
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      status: 'error',
      code: 'INVALID_JSON',
      error: {
        code: 'INVALID_JSON',
        message: 'Malformed JSON payload in request body',
      },
    });
  }

  // Handle body-parser payload size limit exceeded (e.g. > 10kb)
  if (err.type === 'entity.too.large' || err.status === 413) {
    return res.status(413).json({
      status: 'error',
      code: 'PAYLOAD_TOO_LARGE',
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: `Request payload exceeds maximum allowed size of ${config.maxPayloadSize}`,
      },
    });
  }

  // General application error
  const statusCode = err.statusCode || err.status || 500;
  const isProduction = config.env === 'production';

  console.error(`[ERROR] ${req.method} ${req.url} - ${statusCode}:`, err.message);

  return res.status(statusCode).json({
    status: 'error',
    code: err.code || 'INTERNAL_ERROR',
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: isProduction && statusCode === 500 ? 'An internal server error occurred' : err.message,
    },
  });
}

/**
 * 404 Route Not Found middleware
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    status: 'error',
    code: 'NOT_FOUND',
    error: {
      code: 'NOT_FOUND',
      message: `Cannot ${req.method} ${req.originalUrl}`,
    },
  });
}

module.exports = {
  errorHandler,
  notFoundHandler,
};
