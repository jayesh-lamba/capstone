const app = require('./app');
const config = require('./config');
const { testConnection, closePool } = require('./db');

async function startServer() {
  console.log('====================================================');
  console.log(' FlyRank Embeddable Widget & Lead-Capture Platform');
  console.log('====================================================');
  console.log(`[SERVER] Initializing in ${config.env.toUpperCase()} mode...`);

  // Test database connection on startup
  const dbHealth = await testConnection();
  if (dbHealth.connected) {
    console.log(`[DB] Connected to PostgreSQL successfully (${dbHealth.latencyMs}ms latency).`);
  } else {
    console.warn(`[DB] Warning: Could not connect to PostgreSQL: ${dbHealth.error}`);
    console.warn('[DB] Ensure Docker database container is running (docker compose up -d db).');
  }

  const server = app.listen(config.port, () => {
    console.log(`[SERVER] API listening on http://localhost:${config.port}`);
    console.log(`[SERVER] Health probe available at http://localhost:${config.port}/health`);
  });

  // Graceful shutdown management
  let isShuttingDown = false;

  async function shutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`\n[SERVER] Received ${signal}. Starting graceful shutdown...`);

    // Force close after 10s if connections refuse to drain
    const forceExitTimer = setTimeout(() => {
      console.error('[SERVER] Forcefully terminating after shutdown timeout.');
      process.exit(1);
    }, 10000);
    forceExitTimer.unref();

    server.close(async (err) => {
      if (err) {
        console.error('[SERVER] Error while closing HTTP server:', err.message);
      } else {
        console.log('[SERVER] HTTP connections drained and server closed.');
      }

      try {
        await closePool();
      } catch (poolErr) {
        console.error('[DB] Error closing pool:', poolErr.message);
      }

      console.log('[SERVER] Graceful shutdown complete. Exiting.');
      process.exit(0);
    });
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return { app, server };
}

if (require.main === module) {
  startServer().catch((err) => {
    console.error('[SERVER] Fatal startup error:', err);
    process.exit(1);
  });
}

module.exports = { startServer };
