const fs = require('fs');
const path = require('path');
const { pool } = require('./index');

async function runMigrations() {
  let client;
  console.log('[MIGRATIONS] Connecting to database...');

  try {
    client = await pool.connect();
    console.log('[MIGRATIONS] Connected. Initializing migration table...');

    // 1. Ensure migrations tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        version VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 2. Fetch already applied migration versions
    const { rows: appliedRows } = await client.query('SELECT version FROM schema_migrations');
    const appliedVersions = new Set(appliedRows.map((r) => r.version));

    // 3. Scan migrations directory
    const migrationsDir = path.join(__dirname, 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      console.log('[MIGRATIONS] No migrations directory found.');
      return;
    }

    const files = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    let appliedCount = 0;

    for (const file of files) {
      if (appliedVersions.has(file)) {
        console.log(`[MIGRATIONS] Already applied: ${file}`);
        continue;
      }

      console.log(`[MIGRATIONS] Applying migration: ${file}...`);
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      // Execute each migration inside its own transaction
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`[MIGRATIONS] Successfully applied: ${file}`);
        appliedCount++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[MIGRATIONS] Error applying migration ${file}. Rolled back.`, err.message || err.code || err);
        throw err;
      }
    }

    console.log(`[MIGRATIONS] Migration process completed. (${appliedCount} new migrations applied)`);
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[MIGRATIONS] Migration failed:', err.message || err.code || err);
      process.exit(1);
    });
}

module.exports = { runMigrations };
