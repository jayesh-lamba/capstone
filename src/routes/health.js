const express = require('express');
const { testConnection } = require('../db');
const config = require('../config');

const router = express.Router();
const startupTime = Date.now();

/**
 * GET /health
 * Public liveness & readiness health check endpoint.
 */
router.get('/', async (req, res) => {
  const dbHealth = await testConnection();

  const isHealthy = dbHealth.connected;
  const statusCode = isHealthy ? 200 : 503;

  return res.status(statusCode).json({
    status: isHealthy ? 'ok' : 'degraded',
    service: 'flyrank-embeddable-widget-platform',
    version: '1.0.0',
    environment: config.env,
    uptimeSeconds: Math.floor((Date.now() - startupTime) / 1000),
    timestamp: new Date().toISOString(),
    checks: {
      database: {
        status: dbHealth.connected ? 'healthy' : 'unhealthy',
        latencyMs: dbHealth.latencyMs,
        ...(dbHealth.error ? { error: dbHealth.error } : {}),
      },
    },
  });
});

module.exports = router;
