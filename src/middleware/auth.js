const jwt = require('jsonwebtoken');
const config = require('../config');

/**
 * JWT Authentication Middleware
 * Enforces valid Bearer token authentication and extracts tenant context.
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      status: 'error',
      code: 'UNAUTHORIZED',
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing or malformed Authorization header. Expected format: Bearer <token>',
      },
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, config.jwt.secret, { algorithms: ['HS256'] });

    if (!decoded.userId || !decoded.tenantId) {
      return res.status(401).json({
        status: 'error',
        code: 'INVALID_TOKEN',
        error: {
          code: 'INVALID_TOKEN',
          message: 'Token payload missing required identity claims',
        },
      });
    }

    // Attach validated tenant identity to the request context
    req.user = {
      userId: decoded.userId,
      tenantId: decoded.tenantId,
      role: decoded.role || 'member',
    };

    next();
  } catch (err) {
    const isExpired = err.name === 'TokenExpiredError';
    const code = isExpired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN';
    return res.status(401).json({
      status: 'error',
      code,
      error: {
        code,
        message: isExpired ? 'Token has expired. Please log in again.' : 'Invalid authentication token',
      },
    });
  }
}

module.exports = { authenticate };
