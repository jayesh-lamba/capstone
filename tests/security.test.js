process.env.NODE_ENV = 'test';

const { test, after, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const config = require('../src/config');
const { query, closePool } = require('../src/db');

// Seeded tenant & widget identifiers
const acmeTenantId = '8d3e4b2a-c1f7-4b2a-89a1-0a1b2c3d4e5f';
const acmeWidgetId = 'e7b4010a-3d96-48c9-94b2-03d6d03d32cb';
const betaTenantId = '9e4f5c3b-d2a8-4c3b-90b2-1b2c3d4e5f60';
const betaWidgetId = '22222222-3333-4444-5555-666666666666';

let tenantAToken;
let tenantBToken;

before(async () => {
  // Login as Tenant A (Acme Corp)
  const resA = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'admin@acme.com', password: 'SecurePassword123!' });
  tenantAToken = resA.body.data.token;

  // Login as Tenant B (Beta Ltd)
  const resB = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'owner@beta.com', password: 'BetaSecret123!' });
  tenantBToken = resB.body.data.token;
});

after(async () => {
  await closePool();
});

test('Platform Security, Hardening & Isolation Suite', async (t) => {
  // ============================================================================
  // 1. AUTHENTICATION & JWT INTEGRITY
  // ============================================================================
  await t.test('JWT Expiry: Expired token is rejected with 401 TOKEN_EXPIRED', async () => {
    // Generate token that expired 10 seconds ago
    const expiredToken = jwt.sign(
      { userId: '11111111-1111-1111-1111-111111111111', tenantId: acmeTenantId, role: 'owner' },
      config.jwt.secret,
      { expiresIn: '-10s' }
    );

    const res = await request(app)
      .get('/api/v1/widgets')
      .set('Authorization', `Bearer ${expiredToken}`);

    assert.equal(res.status, 401);
    assert.equal(res.body.status, 'error');
    assert.equal(res.body.code, 'TOKEN_EXPIRED');
    assert.equal(res.body.error.code, 'TOKEN_EXPIRED');
    assert.ok(res.body.error.message.includes('expired'));
  });

  await t.test('JWT Tampering: Altered token signature is rejected with 401 INVALID_TOKEN', async () => {
    // Take valid token and tamper with the signature part
    const parts = tenantAToken.split('.');
    const tamperedSig = parts[2].slice(0, -4) + 'XXXX';
    const tamperedToken = `${parts[0]}.${parts[1]}.${tamperedSig}`;

    const res = await request(app)
      .get('/api/v1/widgets')
      .set('Authorization', `Bearer ${tamperedToken}`);

    assert.equal(res.status, 401);
    assert.equal(res.body.status, 'error');
    assert.equal(res.body.code, 'INVALID_TOKEN');
    assert.equal(res.body.error.code, 'INVALID_TOKEN');
  });

  await t.test('JWT Tampering: Algorithm "none" unsigned token is rejected with 401 INVALID_TOKEN', async () => {
    // Construct an unsigned token using header { "alg": "none", "typ": "JWT" }
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ userId: '11111111-1111-1111-1111-111111111111', tenantId: acmeTenantId })
    ).toString('base64url');
    const noneAlgToken = `${header}.${payload}.`;

    const res = await request(app)
      .get('/api/v1/widgets')
      .set('Authorization', `Bearer ${noneAlgToken}`);

    assert.equal(res.status, 401);
    assert.equal(res.body.status, 'error');
    assert.equal(res.body.code, 'INVALID_TOKEN');
  });

  await t.test('JWT Claims: Token missing tenantId is rejected with 401 INVALID_TOKEN', async () => {
    const incompleteToken = jwt.sign(
      { userId: '11111111-1111-1111-1111-111111111111' }, // Missing tenantId
      config.jwt.secret,
      { expiresIn: '1h' }
    );

    const res = await request(app)
      .get('/api/v1/widgets')
      .set('Authorization', `Bearer ${incompleteToken}`);

    assert.equal(res.status, 401);
    assert.equal(res.body.status, 'error');
    assert.equal(res.body.code, 'INVALID_TOKEN');
    assert.ok(res.body.error.message.includes('missing required identity claims'));
  });

  // ============================================================================
  // 2. CROSS-TENANT DASHBOARD ISOLATION
  // ============================================================================
  await t.test('Dashboard Stats Isolation: Tenant A querying Tenant B widget_id returns 0 stats', async () => {
    // Tenant A attempts to view submission metrics for Tenant B's widget
    const res = await request(app)
      .get(`/api/v1/dashboard/stats?widget_id=${betaWidgetId}`)
      .set('Authorization', `Bearer ${tenantAToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'success');
    // Total submissions for Tenant B's widget under Tenant A context must strictly be 0
    assert.equal(res.body.data.total_submissions, 0);
    assert.equal(res.body.data.submissions_over_time.length, 0);
  });

  await t.test('Dashboard Geo Isolation: Tenant A querying Tenant B widget_id returns empty array', async () => {
    // Tenant A attempts to view geo breakdown for Tenant B's widget
    const res = await request(app)
      .get(`/api/v1/dashboard/geo?widget_id=${betaWidgetId}`)
      .set('Authorization', `Bearer ${tenantAToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'success');
    // Zero geo items should leak
    assert.deepEqual(res.body.data, []);
  });

  await t.test('Dashboard Submissions Isolation: Tenant A querying Tenant B widget_id returns 0 records', async () => {
    // Tenant A attempts to query submissions for Tenant B's widget
    const res = await request(app)
      .get(`/api/v1/dashboard/submissions?widget_id=${betaWidgetId}`)
      .set('Authorization', `Bearer ${tenantAToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'success');
    assert.equal(res.body.data.submissions.length, 0);
    assert.equal(res.body.data.pagination.total, 0);
  });

  // ============================================================================
  // 3. SPAM DEFENSE & TIMING ANOMALY HARDENING
  // ============================================================================
  await t.test('Honeypot Hardening: Non-string truthy values (number, boolean) trigger 400 SPAM_DETECTED', async () => {
    const resNum = await request(app)
      .post('/api/v1/submissions')
      .send({
        widget_id: acmeWidgetId,
        payload: { email: 'num_bot@example.com', name: 'Bot' },
        _hp_company: 12345, // Number payload
        _rendered_at: Date.now() - 2000,
      });

    assert.equal(resNum.status, 400);
    assert.equal(resNum.body.code, 'SPAM_DETECTED');
    assert.equal(resNum.body.error.code, 'SPAM_DETECTED');

    const resBool = await request(app)
      .post('/api/v1/submissions')
      .send({
        widget_id: acmeWidgetId,
        payload: { email: 'bool_bot@example.com', name: 'Bot' },
        _hp_company: true, // Boolean payload
        _rendered_at: Date.now() - 2000,
      });

    assert.equal(resBool.status, 400);
    assert.equal(resBool.body.code, 'SPAM_DETECTED');
  });

  await t.test('Timing Hardening: Timestamp in the future returns 400 INVALID_TIMESTAMP', async () => {
    const futureRenderTime = Date.now() + 60000; // 60 seconds in future
    const res = await request(app)
      .post('/api/v1/submissions')
      .send({
        widget_id: acmeWidgetId,
        payload: { email: 'future_bot@example.com', name: 'Time Traveler' },
        _rendered_at: futureRenderTime,
      });

    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'INVALID_TIMESTAMP');
    assert.equal(res.body.error.code, 'INVALID_TIMESTAMP');
    assert.ok(res.body.error.message.includes('future'));
  });

  await t.test('Timing Hardening: Negative or non-numeric render timestamp returns 400 INVALID_TIMESTAMP', async () => {
    const resNeg = await request(app)
      .post('/api/v1/submissions')
      .send({
        widget_id: acmeWidgetId,
        payload: { email: 'neg_bot@example.com', name: 'Neg Bot' },
        _rendered_at: -1000,
      });

    assert.equal(resNeg.status, 400);
    assert.equal(resNeg.body.code, 'INVALID_TIMESTAMP');

    const resNaN = await request(app)
      .post('/api/v1/submissions')
      .send({
        widget_id: acmeWidgetId,
        payload: { email: 'nan_bot@example.com', name: 'NaN Bot' },
        _rendered_at: 'not_a_valid_number',
      });

    assert.equal(resNaN.status, 400);
    assert.equal(resNaN.body.code, 'INVALID_TIMESTAMP');
  });

  // ============================================================================
  // 4. MALFORMED PAYLOADS & BOUNDARY PROTECTION
  // ============================================================================
  await t.test('Malformed JSON syntax in body returns 400 INVALID_JSON', async () => {
    const res = await request(app)
      .post('/api/v1/submissions')
      .set('Content-Type', 'application/json')
      .send('{"broken_json": true, missing_bracket');

    assert.equal(res.status, 400);
    assert.equal(res.body.status, 'error');
    assert.equal(res.body.code, 'INVALID_JSON');
    assert.equal(res.body.error.code, 'INVALID_JSON');
  });

  await t.test('Empty submission payload object returns 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/v1/submissions')
      .send({
        widget_id: acmeWidgetId,
        payload: {}, // Empty payload
        _rendered_at: Date.now() - 2000,
      });

    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'VALIDATION_ERROR');
    assert.ok(res.body.error.message.includes('at least one field'));
  });

  // ============================================================================
  // 5. SQL INJECTION PROBE RESISTANCE
  // ============================================================================
  await t.test('SQL Injection Probes in search query parameter are safely handled', async () => {
    const sqliQuery = "'; DROP TABLE submissions; --";
    const res = await request(app)
      .get(`/api/v1/dashboard/submissions?search=${encodeURIComponent(sqliQuery)}`)
      .set('Authorization', `Bearer ${tenantAToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'success');
    assert.equal(res.body.data.submissions.length, 0);

    // Confirm database table still exists and is healthy
    const checkRes = await query('SELECT count(*)::int as count FROM submissions');
    assert.ok(checkRes.rows[0].count >= 0);
  });

  await t.test('SQL Injection in UUID path parameters is rejected by Zod before reaching DB', async () => {
    const sqliId = "11111111-1111-1111-1111-111111111111' OR 1=1--";
    const res = await request(app)
      .get(`/api/v1/widgets/${encodeURIComponent(sqliId)}`)
      .set('Authorization', `Bearer ${tenantAToken}`);

    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'VALIDATION_ERROR');
    assert.ok(res.body.error.message.includes('valid UUID'));
  });
});
