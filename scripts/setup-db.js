const { Client } = require('pg');

async function setup() {
  const client = new Client({
    connectionString: 'postgresql://postgres:password@localhost:5432/flyrank_widgets',
  });
  await client.connect();

  const roles = await client.query('SELECT rolname FROM pg_roles WHERE rolname = $1', ['flyrank_user']);
  if (roles.rows.length === 0) {
    await client.query("CREATE ROLE flyrank_user WITH LOGIN SUPERUSER PASSWORD 'flyrank_secret_pass'");
    console.log('[DB-SETUP] Created flyrank_user superuser role.');
  } else {
    console.log('[DB-SETUP] flyrank_user role already exists.');
  }

  await client.query('GRANT ALL PRIVILEGES ON DATABASE flyrank_widgets TO flyrank_user');
  console.log('[DB-SETUP] Granted database privileges to flyrank_user.');

  await client.end();
}

setup().catch((err) => {
  console.error('[DB-SETUP] Error:', err.message);
  process.exit(1);
});
