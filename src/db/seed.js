const bcrypt = require('bcryptjs');
const { pool } = require('./index');

async function runSeed() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[SEED FATAL] Refusing to execute development seed script in a PRODUCTION environment.');
  }

  let client;
  console.log('[SEED] Connecting to database (development/test environment)...');

  try {
    client = await pool.connect();
    console.log('[SEED] Connected. Seeding initial development tenants, demo users, and sample widgets...');
    await client.query('BEGIN');

    // 1. Seed Tenant 1 (Acme Corp - Demo development tenant)
    const tenant1Id = '8d3e4b2a-c1f7-4b2a-89a1-0a1b2c3d4e5f';
    await client.query(
      `
      INSERT INTO tenants (id, name, plan)
      VALUES ($1, $2, $3)
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, plan = EXCLUDED.plan;
      `,
      [tenant1Id, 'Acme Corp', 'enterprise']
    );

    // 2. Seed Tenant 2 (Beta Ltd - For multi-tenant isolation testing)
    const tenant2Id = '11111111-2222-3333-4444-555555555555';
    await client.query(
      `
      INSERT INTO tenants (id, name, plan)
      VALUES ($1, $2, $3)
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, plan = EXCLUDED.plan;
      `,
      [tenant2Id, 'Beta Ltd', 'standard']
    );

    // 3. Seed Users with bcrypt hashed passwords (DEVELOPMENT ONLY DEMO USERS)
    const saltRounds = 10;
    const acmePasswordHash = await bcrypt.hash('SecurePassword123!', saltRounds);
    const betaPasswordHash = await bcrypt.hash('BetaSecret123!', saltRounds);

    await client.query(
      `
      INSERT INTO users (id, tenant_id, email, password_hash, role)
      VALUES 
        ('c1f7b19a-9d3e-4b2a-89a1-7c9b8a3e4d5f', $1, 'admin@acme.com', $2, 'owner'),
        ('d2f8c20b-0e4f-5c3b-90b2-8d0c9b4f5e6a', $3, 'owner@beta.com', $4, 'owner')
      ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash;
      `,
      [tenant1Id, acmePasswordHash, tenant2Id, betaPasswordHash]
    );

    // 4. Seed Demo Widgets
    const acmeWidgetId = 'e7b4010a-3d96-48c9-94b2-03d6d03d32cb';
    const acmeFields = JSON.stringify([
      { name: 'email', type: 'email', label: 'Work Email', required: true },
      { name: 'name', type: 'text', label: 'Full Name', required: true },
      { name: 'company', type: 'text', label: 'Company Name', required: false },
    ]);
    const acmeDisplay = JSON.stringify({
      position: 'bottom-right',
      theme_color: '#2563eb',
      allowed_origins: ['http://localhost:5500', 'http://127.0.0.1:5500'],
    });

    await client.query(
      `
      INSERT INTO widgets (id, tenant_id, name, type, title, description, button_text, fields_schema, display_rules, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO UPDATE SET 
        title = EXCLUDED.title,
        fields_schema = EXCLUDED.fields_schema,
        display_rules = EXCLUDED.display_rules,
        is_active = EXCLUDED.is_active;
      `,
      [
        acmeWidgetId,
        tenant1Id,
        'Acme Newsletter Opt-in',
        'signup_form',
        'Stay Ahead with Acme Insights',
        'Receive curated weekly engineering briefings straight to your inbox.',
        'Subscribe Now',
        acmeFields,
        acmeDisplay,
        true,
      ]
    );

    const betaWidgetId = '22222222-3333-4444-5555-666666666666';
    const betaFields = JSON.stringify([
      { name: 'email', type: 'email', label: 'Contact Email', required: true },
      { name: 'feedback', type: 'text', label: 'Your Feedback', required: true },
    ]);
    const betaDisplay = JSON.stringify({
      position: 'center-modal',
      theme_color: '#10b981',
      allowed_origins: ['http://localhost:5500'],
    });

    await client.query(
      `
      INSERT INTO widgets (id, tenant_id, name, type, title, description, button_text, fields_schema, display_rules, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO UPDATE SET 
        title = EXCLUDED.title,
        fields_schema = EXCLUDED.fields_schema,
        display_rules = EXCLUDED.display_rules;
      `,
      [
        betaWidgetId,
        tenant2Id,
        'Beta Feedback Widget',
        'popover',
        'We value your feedback',
        'Help us improve our developer tooling.',
        'Send Feedback',
        betaFields,
        betaDisplay,
        true,
      ]
    );

    // 5. Seed initial demo submissions for Acme widget to power dashboard aggregations
    const samplePayload = JSON.stringify({ email: 'lead1@example.com', name: 'Alice Developer', company: 'Tech Corp' });
    await client.query(
      `
      INSERT INTO submissions (id, widget_id, tenant_id, payload, visitor_ip, country_code, country_name, city, geo_provider, geo_status)
      VALUES 
        ('33333333-4444-5555-6666-777777777771', $1, $2, $3, '203.0.113.1', 'US', 'United States', 'San Francisco', 'ip-api', 'enriched'),
        ('33333333-4444-5555-6666-777777777772', $1, $2, $3, '203.0.113.2', 'DE', 'Germany', 'Frankfurt', 'ipapi.co', 'enriched'),
        ('33333333-4444-5555-6666-777777777773', $1, $2, $3, '203.0.113.3', 'IN', 'India', 'Bengaluru', 'ip-api', 'enriched')
      ON CONFLICT (id) DO NOTHING;
      `,
      [acmeWidgetId, tenant1Id, samplePayload]
    );

    await client.query('COMMIT');
    console.log('[SEED] Demo data seeded successfully.');
    console.log('  - Tenant 1: Acme Corp (ID: ' + tenant1Id + ')');
    console.log('    User: admin@acme.com / SecurePassword123!');
    console.log('    Widget: Acme Newsletter Opt-in (ID: ' + acmeWidgetId + ')');
    console.log('  - Tenant 2: Beta Ltd (ID: ' + tenant2Id + ')');
    console.log('    User: owner@beta.com / BetaSecret123!');
    console.log('    Widget: Beta Feedback Widget (ID: ' + betaWidgetId + ')');
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    console.error('[SEED] Error seeding database. Rolled back.', err.message || err.code || err);
    throw err;
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

if (require.main === module) {
  runSeed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[SEED] Seed failed:', err.message || err.code || err);
      process.exit(1);
    });
}

module.exports = { runSeed };
