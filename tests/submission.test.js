process.env.NODE_ENV = 'test';

const { test, after, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../src/app');
const { query, closePool } = require('../src/db');
const { resetRateLimits } = require('../src/middleware/rateLimiter');

// Seeded widgets from src/db/seed.js:
// Acme Newsletter Widget: 'e7b4010a-3d96-48c9-94b2-03d6d03d32cb'
// Allowed origins: ['http://localhost:5500', 'http://127.0.0.1:5500']
// Fields: email (required, email), name (required, text), company (optional, text)
const acmeWidgetId = 'e7b4010a-3d96-48c9-94b2-03d6d03d32cb';
const acmeTenantId = '8d3e4b2a-c1f7-4b2a-89a1-0a1b2c3d4e5f';

// Temporary test widget for origin restrictions
let restrictedWidgetId;

before(async () => {
  // Create a widget with strict origin restrictions for testing
  const res = await query(
    `INSERT INTO widgets (
       tenant_id, name, type, title, fields_schema, display_rules, is_active
     ) VALUES (
       $1, 'Strict Origin Form', 'signup_form', 'Strict Form',
       '[{"name": "email", "type": "email", "label": "Email", "required": true}]'::jsonb,
       '{"allowed_origins": ["https://trusted-site.com"]}'::jsonb,
       true
     ) RETURNING id`,
    [acmeTenantId]
  );
  restrictedWidgetId = res.rows[0].id;
});

beforeEach(() => {
  // Reset rate limit stores between test cases
  resetRateLimits();
  delete process.env.MOCK_GEO_PROVIDER_A_FAIL;
  delete process.env.MOCK_GEO_PROVIDER_B_FAIL;
  delete process.env.SIMULATE_SIDE_EFFECT_FAILURE;
});

after(async () => {
  if (restrictedWidgetId) {
    await query('DELETE FROM widgets WHERE id = $1', [restrictedWidgetId]);
  }
  await closePool();
});

test('Public Submission Pipeline (/api/v1/submissions)', async (t) => {
  await t.test('OPTIONS preflight returns 204 with complete CORS headers', async () => {
    const res = await request(app)
      .options('/api/v1/submissions')
      .set('Origin', 'http://localhost:5500')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Content-Type');

    assert.equal(res.status, 204);
    assert.equal(res.headers['access-control-allow-origin'], 'http://localhost:5500');
    assert.ok(res.headers['access-control-allow-methods'].includes('POST'));
    assert.ok(res.headers['access-control-allow-headers'].includes('Content-Type'));
  });

  await t.test('POST valid submission creates record in DB and returns 201 Created', async () => {
    const renderTime = Date.now() - 3000; // 3 seconds ago
    const res = await request(app)
      .post('/api/v1/submissions')
      .set('Origin', 'http://localhost:5500')
      .send({
        widget_id: acmeWidgetId,
        payload: {
          email: 'valid.visitor@example.com',
          name: 'Jane Doe',
          company: 'Acme Partner',
        },
        _hp_company: '',
        _rendered_at: renderTime,
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.status, 'success');
    assert.ok(res.body.data.submission_id);

    // Verify submission is safely committed to PostgreSQL with correct tenancy
    const dbRes = await query('SELECT * FROM submissions WHERE id = $1', [
      res.body.data.submission_id,
    ]);
    assert.equal(dbRes.rows.length, 1);
    assert.equal(dbRes.rows[0].widget_id, acmeWidgetId);
    assert.equal(dbRes.rows[0].tenant_id, acmeTenantId);
    assert.equal(dbRes.rows[0].payload.email, 'valid.visitor@example.com');
  });

  await t.test('POST submission with invalid widget ID returns 404 WIDGET_NOT_FOUND', async () => {
    const res = await request(app)
      .post('/api/v1/submissions')
      .send({
        widget_id: '99999999-9999-9999-9999-999999999999',
        payload: { email: 'test@example.com', name: 'Tester' },
        _rendered_at: Date.now() - 2000,
      });

    assert.equal(res.status, 404);
    assert.equal(res.body.status, 'error');
    assert.equal(res.body.error.code, 'WIDGET_NOT_FOUND');
  });

  await t.test('POST submission with malformed UUID returns 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/v1/submissions')
      .send({
        widget_id: 'not-a-valid-uuid',
        payload: { email: 'test@example.com' },
      });

    assert.equal(res.status, 400);
    assert.equal(res.body.status, 'error');
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  await t.test('POST submission missing required schema field returns 422 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/v1/submissions')
      .send({
        widget_id: acmeWidgetId,
        payload: {
          company: 'Missing Required Email and Name',
        },
        _rendered_at: Date.now() - 2000,
      });

    assert.equal(res.status, 422);
    assert.equal(res.body.status, 'error');
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    assert.ok(res.body.error.message.includes('required'));
  });

  await t.test('POST submission with invalid email format returns 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/v1/submissions')
      .send({
        widget_id: acmeWidgetId,
        payload: {
          email: 'invalid-email-address',
          name: 'Bob',
        },
        _rendered_at: Date.now() - 2000,
      });

    assert.equal(res.status, 400);
    assert.equal(res.body.status, 'error');
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    assert.ok(res.body.error.message.includes('email'));
  });

  await t.test('Enforce allowed-origin rules: permitted origin returns 201', async () => {
    const res = await request(app)
      .post('/api/v1/submissions')
      .set('Origin', 'https://trusted-site.com')
      .send({
        widget_id: restrictedWidgetId,
        payload: { email: 'trusted@domain.com' },
        _rendered_at: Date.now() - 2000,
      });

    assert.equal(res.status, 201);
  });

  await t.test('Enforce allowed-origin rules: unpermitted origin returns 403 FORBIDDEN_ORIGIN', async () => {
    const res = await request(app)
      .post('/api/v1/submissions')
      .set('Origin', 'https://malicious-site.com')
      .send({
        widget_id: restrictedWidgetId,
        payload: { email: 'attacker@domain.com' },
        _rendered_at: Date.now() - 2000,
      });

    assert.equal(res.status, 403);
    assert.equal(res.body.status, 'error');
    assert.equal(res.body.error.code, 'FORBIDDEN_ORIGIN');
  });

  await t.test('Oversized payload exceeding 10KB returns 413 PAYLOAD_TOO_LARGE', async () => {
    const massiveString = 'A'.repeat(12 * 1024); // 12 KB
    const res = await request(app)
      .post('/api/v1/submissions')
      .send({
        widget_id: acmeWidgetId,
        payload: {
          email: 'big@example.com',
          name: massiveString,
        },
      });

    assert.equal(res.status, 413);
    assert.equal(res.body.status, 'error');
    assert.equal(res.body.error.code, 'PAYLOAD_TOO_LARGE');
  });

  await t.test('Honeypot protection: populating _hp_company returns 400 SPAM_DETECTED', async () => {
    const res = await request(app)
      .post('/api/v1/submissions')
      .send({
        widget_id: acmeWidgetId,
        payload: { email: 'spammer@bot.com', name: 'Bot' },
        _hp_company: 'I am an automated spam bot',
        _rendered_at: Date.now() - 2500,
      });

    assert.equal(res.status, 400);
    assert.equal(res.body.status, 'error');
    assert.equal(res.body.error.code, 'SPAM_DETECTED');
  });

  await t.test('Velocity protection: fast submissions (< 1000ms elapsed) return 400 SUBMISSION_TOO_FAST', async () => {
    const fastRenderTime = Date.now() - 300; // Only 300ms elapsed!
    const res = await request(app)
      .post('/api/v1/submissions')
      .send({
        widget_id: acmeWidgetId,
        payload: { email: 'flash@example.com', name: 'Flash' },
        _rendered_at: fastRenderTime,
      });

    assert.equal(res.status, 400);
    assert.equal(res.body.status, 'error');
    assert.equal(res.body.error.code, 'SUBMISSION_TOO_FAST');
  });

  await t.test('Rate limiting: exceeding 15 requests/min from same IP returns 429', async () => {
    const fakeIp = '203.0.113.55';
    // Fire 15 requests (allowed)
    for (let i = 0; i < 15; i++) {
      const res = await request(app)
        .post('/api/v1/submissions')
        .set('X-Forwarded-For', fakeIp)
        .send({
          widget_id: acmeWidgetId,
          payload: { email: `visitor_${i}@test.com`, name: `Visitor ${i}` },
          _rendered_at: Date.now() - 2000,
        });
      assert.equal(res.status, 201);
    }

    // 16th request from same IP must be rejected with 429
    const blockedRes = await request(app)
      .post('/api/v1/submissions')
      .set('X-Forwarded-For', fakeIp)
      .send({
        widget_id: acmeWidgetId,
        payload: { email: 'blocked@test.com', name: 'Blocked' },
        _rendered_at: Date.now() - 2000,
      });

    assert.equal(blockedRes.status, 429);
    assert.equal(blockedRes.body.error.code, 'RATE_LIMIT_EXCEEDED');

    // Ensure a different IP can still submit normally
    const cleanIpRes = await request(app)
      .post('/api/v1/submissions')
      .set('X-Forwarded-For', '203.0.113.99')
      .send({
        widget_id: acmeWidgetId,
        payload: { email: 'clean@test.com', name: 'Clean User' },
        _rendered_at: Date.now() - 2000,
      });
    assert.equal(cleanIpRes.status, 201);
  });

  await t.test('Per-widget rate limiting: exceeding 60 requests/min across rotating IPs returns 429', async () => {
    // Send 60 requests each with a distinct IP to hit per-widget limit
    for (let i = 1; i <= 60; i++) {
      const distinctIp = `198.51.100.${i}`;
      const res = await request(app)
        .post('/api/v1/submissions')
        .set('X-Forwarded-For', distinctIp)
        .send({
          widget_id: acmeWidgetId,
          payload: { email: `lead_${i}@example.com`, name: `Lead ${i}` },
          _rendered_at: Date.now() - 2000,
        });
      assert.equal(res.status, 201);
    }

    // 61st request to the same widget (even from a fresh IP) must be blocked with 429
    const blockedRes = await request(app)
      .post('/api/v1/submissions')
      .set('X-Forwarded-For', '198.51.100.99')
      .send({
        widget_id: acmeWidgetId,
        payload: { email: 'overflow@example.com', name: 'Overflow' },
        _rendered_at: Date.now() - 2000,
      });

    assert.equal(blockedRes.status, 429);
    assert.equal(blockedRes.body.error.code, 'RATE_LIMIT_EXCEEDED');
    assert.ok(blockedRes.body.error.message.includes('Per-widget rate limit exceeded'));

    // A different widget should NOT be blocked
    const otherWidgetRes = await request(app)
      .post('/api/v1/submissions')
      .set('X-Forwarded-For', '198.51.100.99')
      .set('Origin', 'https://trusted-site.com')
      .send({
        widget_id: restrictedWidgetId,
        payload: { email: 'different_widget@example.com' },
        _rendered_at: Date.now() - 2000,
      });
    assert.equal(otherWidgetRes.status, 201);
  });

  // GEOLOCATION FALLBACK CHAIN TESTS
  await t.test('Geolocation fallback: Provider A fails -> Provider B enriches submission', async () => {
    process.env.MOCK_GEO_PROVIDER_A_FAIL = 'true';
    process.env.MOCK_GEO_PROVIDER_B_FAIL = 'false';

    const testPublicIp = '8.8.8.8';
    const res = await request(app)
      .post('/api/v1/submissions')
      .set('X-Forwarded-For', testPublicIp)
      .send({
        widget_id: acmeWidgetId,
        payload: { email: 'fallback_b@example.com', name: 'Fallback B' },
        _rendered_at: Date.now() - 2000,
      });

    assert.equal(res.status, 201);
    const subId = res.body.data.submission_id;

    const row = (await query('SELECT * FROM submissions WHERE id = $1', [subId])).rows[0];
    assert.equal(row.geo_provider, 'ipapi.co');
    assert.equal(row.geo_status, 'enriched');
    assert.ok(row.country_code);
  });

  await t.test('Geolocation dual failure: Both providers fail -> submission still succeeds with 201 (degrade, never fail)', async () => {
    process.env.MOCK_GEO_PROVIDER_A_FAIL = 'true';
    process.env.MOCK_GEO_PROVIDER_B_FAIL = 'true';

    const testPublicIp = '8.8.8.8';
    const res = await request(app)
      .post('/api/v1/submissions')
      .set('X-Forwarded-For', testPublicIp)
      .send({
        widget_id: acmeWidgetId,
        payload: { email: 'dual_fail@example.com', name: 'Dual Fail' },
        _rendered_at: Date.now() - 2000,
      });

    assert.equal(res.status, 201);
    const subId = res.body.data.submission_id;

    // Verify record saved with null geo and failed status
    const row = (await query('SELECT * FROM submissions WHERE id = $1', [subId])).rows[0];
    assert.equal(row.geo_status, 'failed');
    assert.equal(row.country_code, null);
    assert.equal(row.country_name, null);
    assert.equal(row.city, null);
  });

  // SAFE SIDE EFFECT TESTS
  await t.test('Safe side effects: secondary notification failure does NOT prevent submission success', async () => {
    process.env.SIMULATE_SIDE_EFFECT_FAILURE = 'true';

    const res = await request(app)
      .post('/api/v1/submissions')
      .send({
        widget_id: acmeWidgetId,
        payload: { email: 'side_effect_err@example.com', name: 'Error Tester' },
        _rendered_at: Date.now() - 2000,
      });

    assert.equal(res.status, 201);
    const subId = res.body.data.submission_id;

    // Verify submission is safely stored
    const subRow = (await query('SELECT * FROM submissions WHERE id = $1', [subId])).rows[0];
    assert.ok(subRow);

    // Give asynchronous setImmediate worker a moment to write to side_effect_logs
    await new Promise((r) => setTimeout(r, 100));

    // Verify failure was captured in audit log
    const auditRes = await query(
      'SELECT * FROM side_effect_logs WHERE submission_id = $1 AND status = $2',
      [subId, 'failed']
    );
    assert.ok(auditRes.rows.length >= 1);
    assert.ok(auditRes.rows[0].error_message.includes('Simulated side effect failure'));
  });
});
