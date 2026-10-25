const { execSync } = require('child_process');
const path = require('path');

const pgDataDir = path.join(__dirname, '../pgdata');
const pgCtlExe = path.join(__dirname, '../node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe');

try {
  const output = execSync(`"${pgCtlExe}" -D "${pgDataDir}" status`, { encoding: 'utf8' });
  console.log('[DB]', output.trim());
} catch (err) {
  console.log('[DB] No PostgreSQL server running.');
}
