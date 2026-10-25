const config = require('../config');

// In-memory sliding window store for rate limiting
const ipStore = new Map();
const widgetStore = new Map();

/**
 * Clean up expired rate limiting entries
 */
function cleanupStore(store) {
  const now = Date.now();
  for (const [key, value] of store.entries()) {
    if (now > value.resetTime) {
      store.delete(key);
    }
  }
}

// Periodically clean up stores every 60 seconds
const cleanupInterval = setInterval(() => {
  cleanupStore(ipStore);
  cleanupStore(widgetStore);
}, 60000);
cleanupInterval.unref();

/**
 * Two-tier rate limiter middleware:
 * Tier 1: Global IP limiter (default 15 req/min per IP)
 * Tier 2: Per-Widget limiter (default 60 req/min per widget ID)
 */
function submissionRateLimiter(req, res, next) {
  const now = Date.now();
  const windowMs = config.rateLimit.windowMs || 60000;

  // Extract client IP (respecting reverse proxies / forwarded headers)
  const clientIp =
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.socket.remoteAddress ||
    '127.0.0.1';

  // 1. Tier 1: Global IP Rate Limit
  let ipRecord = ipStore.get(clientIp);
  if (!ipRecord || now > ipRecord.resetTime) {
    ipRecord = { count: 0, resetTime: now + windowMs };
    ipStore.set(clientIp, ipRecord);
  }

  ipRecord.count++;

  if (ipRecord.count > config.rateLimit.maxPerIp) {
    const retryAfter = Math.ceil((ipRecord.resetTime - now) / 1000);
    res.setHeader('Retry-After', retryAfter);
    return res.status(429).json({
      status: 'error',
      code: 'RATE_LIMIT_EXCEEDED',
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Global IP rate limit exceeded. Too many requests, please try again later.',
      },
    });
  }

  // 2. Tier 2: Per-Widget Rate Limit (if widget_id is provided in body)
  const widgetId = req.body?.widget_id;
  if (widgetId) {
    let widgetRecord = widgetStore.get(widgetId);
    if (!widgetRecord || now > widgetRecord.resetTime) {
      widgetRecord = { count: 0, resetTime: now + windowMs };
      widgetStore.set(widgetId, widgetRecord);
    }

    widgetRecord.count++;

    if (widgetRecord.count > config.rateLimit.maxPerWidget) {
      const retryAfter = Math.ceil((widgetRecord.resetTime - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      return res.status(429).json({
        status: 'error',
        code: 'RATE_LIMIT_EXCEEDED',
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Per-widget rate limit exceeded for this form. Please try again later.',
        },
      });
    }
  }

  next();
}

/**
 * Helper to reset rate limits (primarily for automated testing)
 */
function resetRateLimits() {
  ipStore.clear();
  widgetStore.clear();
}

module.exports = {
  submissionRateLimiter,
  resetRateLimits,
};
