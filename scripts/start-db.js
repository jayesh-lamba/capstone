const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const pgDataDir = path.join(__dirname, '../pgdata');
const pgBinDir = path.join(__dirname, '../node_modules/@embedded-postgres/windows-x64/native/bin');
const postgresExe = path.join(pgBinDir, 'postgres.exe');
const pgCtlExe = path.join(pgBinDir, 'pg_ctl.exe');

async function startDb() {
  if (!fs.existsSync(pgDataDir)) {
    console.error(`[DB] Data directory not found at: ${pgDataDir}`);
    process.exit(1);
  }

  try {
    const status = execSync(`"${pgCtlExe}" -D "${pgDataDir}" status`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    if (status.includes('server is running')) {
      console.log('[DB] PostgreSQL server is already running.');
      return;
    }
  } catch {
    // Not running, proceed to start
  }

  console.log('[DB] Starting PostgreSQL server...');
  const child = spawn(postgresExe, ['-D', pgDataDir], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  // Wait briefly for port to bind
  await new Promise((r) => setTimeout(r, 1500));
  try {
    const status = execSync(`"${pgCtlExe}" -D "${pgDataDir}" status`, { encoding: 'utf8' });
    console.log('[DB]', status.trim());
  } catch (err) {
    console.warn('[DB] Server starting up. Check status with npm run db:status');
  }
}

startDb().catch(console.error);
