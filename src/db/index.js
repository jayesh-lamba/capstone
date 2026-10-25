const { Pool } = require('pg');
const config = require('../config');

const pool = new Pool({
  connectionString: config.db.url,
  max: config.db.max,
  idleTimeoutMillis: config.db.idleTimeoutMillis,
  connectionTimeoutMillis: config.db.connectionTimeoutMillis,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle client:', err.message);
});

/**
 * Execute a parameterized query against the pool.
 * @param {string} text - SQL statement
 * @param {Array} params - Parameter values
 * @returns {Promise<import('pg').QueryResult>}
 */
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (config.env === 'development' && duration > 100) {
      console.warn(`[DB] Slow query (${duration}ms):`, text.substring(0, 100));
    }
    return res;
  } catch (err) {
    console.error('[DB] Query error:', { text: text.substring(0, 100), error: err.message });
    throw err;
  }
}

/**
 * Acquire a dedicated client from the pool (for transactions).
 * Remember to call client.release() when finished!
 * @returns {Promise<import('pg').PoolClient>}
 */
async function getClient() {
  return await pool.connect();
}

/**
 * Test connectivity to the database.
 * @returns {Promise<{ connected: boolean, latencyMs: number, error?: string }>}
 */
async function testConnection() {
  const start = Date.now();
  try {
    await pool.query('SELECT 1 AS healthcheck');
    return {
      connected: true,
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    return {
      connected: false,
      latencyMs: Date.now() - start,
      error: err.message,
    };
  }
}

/**
 * Gracefully close the database connection pool.
 */
async function closePool() {
  console.log('[DB] Closing PostgreSQL connection pool...');
  await pool.end();
  console.log('[DB] PostgreSQL pool closed.');
}

module.exports = {
  pool,
  query,
  getClient,
  testConnection,
  closePool,
};
