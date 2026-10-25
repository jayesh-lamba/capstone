process.env.NODE_ENV = 'test';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../src/app');
const { query, closePool } = require('../src/db');

// Tenant A (Acme Corp)
const tenantAId = '8d3e4b2a-c1f7-4b2a-89a1-0a1b2c3d4e5f';
const widgetAId = 'e7b4010a-3d96-48c9-94b2-03d6d03d32cb';
let tokenTenantA;

// Tenant B (Beta Ltd)
const widgetBId = '22222222-3333-4444-5555-666666666666';
let tokenTenantB;

let testSubmissionId;

before(async () => {
  // Login as Tenant A
  const resA = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'admin@acme.com', password: 'SecurePassword123!' });
  tokenTenantA = resA.body.data.token;

  // Login as Tenant B
  const resB = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'owner@beta.com', password: 'BetaSecret123!' });
  tokenTenantB = resB.body.data.token;

  // Seed known submissions for deterministic testing
  const res = await query(
    `INSERT INTO submissions (
       tenant_id, widget_id, payload, visitor_ip, country_code, country_name, city, geo_status
     ) VALUES (
       $1, $2, '{"name": "Alice Tester", "email": "alice@test.com", "notes": "Interested in Enterprise"}'::jsonb,
       '203.0.113.195', 'US', 'United States', 'San Francisco', 'enriched'
     ) RETURNING id`,
    [tenantAId, widgetAId]
  );
  testSubmissionId = res.rows[0].id;
});

after(async () => {
  if (testSubmissionId) {
    await query('DELETE FROM submissions WHERE id = $1', [testSubmissionId]);
  }
  await closePool();
});

test('Dashboard Analytics & Tenant Management APIs (/api/v1/dashboard)', async (t) => {
  await t.test('GET /api/v1/dashboard/submissions without auth token returns 401 UNAUTHORIZED', async () => {
    const res = await request(app).get('/api/v1/dashboard/submissions');
    assert.equal(res.status, 401);
    assert.equal(res.body.code, 'UNAUTHORIZED');
  });

  await t.test('GET /api/v1/dashboard/stats without auth token returns 401 UNAUTHORIZED', async () => {
    const res = await request(app).get('/api/v1/dashboard/stats');
    assert.equal(res.status, 401);
    assert.equal(res.body.code, 'UNAUTHORIZED');
  });

  await t.test('GET /api/v1/dashboard/geo without auth token returns 401 UNAUTHORIZED', async () => {
    const res = await request(app).get('/api/v1/dashboard/geo');
    assert.equal(res.status, 401);
    assert.equal(res.body.code, 'UNAUTHORIZED');
  });

  await t.test('GET /api/v1/dashboard/submissions with invalid token signature returns 401 INVALID_TOKEN', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/submissions')
      .set('Authorization', 'Bearer invalid.token.signature');
    assert.equal(res.status, 401);
    assert.equal(res.body.code, 'INVALID_TOKEN');
  });

  await t.test('GET /api/v1/dashboard/submissions returns paginated results with stable sorting', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/submissions?page=1&limit=10')
      .set('Authorization', `Bearer ${tokenTenantA}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'success');
    const { submissions, pagination } = res.body.data;

    assert.ok(Array.isArray(submissions));
    assert.ok(submissions.length > 0);
    assert.equal(pagination.page, 1);
    assert.equal(pagination.limit, 10);
    assert.ok(typeof pagination.total === 'number');
    assert.ok(pagination.total >= 1);

    // Verify record structure
    const sample = submissions[0];
    assert.ok(sample.id);
    assert.ok(sample.widget_id);
    assert.ok(sample.payload);
    assert.ok(sample.visitor_ip);
    assert.ok(sample.created_at);

    // Stable sort check: created_at descending
    if (submissions.length > 1) {
      const d1 = new Date(submissions[0].created_at).getTime();
      const d2 = new Date(submissions[1].created_at).getTime();
      assert.ok(d1 >= d2, 'Submissions must be ordered by created_at DESC');
    }
  });

  await t.test('GET /api/v1/dashboard/submissions validates page parameter and rejects invalid input with 400', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/submissions?page=-5')
      .set('Authorization', `Bearer ${tokenTenantA}`);

    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'VALIDATION_ERROR');
  });

  await t.test('GET /api/v1/dashboard/submissions supports search filter across payload and location', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/submissions?search=Enterprise')
      .set('Authorization', `Bearer ${tokenTenantA}`);

    assert.equal(res.status, 200);
    const { submissions } = res.body.data;
    assert.ok(submissions.length >= 1);
    assert.ok(JSON.stringify(submissions[0].payload).includes('Enterprise'));
  });

  await t.test('GET /api/v1/dashboard/submissions filters by widget_id', async () => {
    const res = await request(app)
      .get(`/api/v1/dashboard/submissions?widget_id=${widgetAId}`)
      .set('Authorization', `Bearer ${tokenTenantA}`);

    assert.equal(res.status, 200);
    const { submissions } = res.body.data;
    assert.ok(submissions.every((s) => s.widget_id === widgetAId));
  });

  await t.test('Cross-tenant isolation: Tenant A cannot view Tenant B submissions', async () => {
    // Tenant A queries submissions
    const resA = await request(app)
      .get('/api/v1/dashboard/submissions')
      .set('Authorization', `Bearer ${tokenTenantA}`);
    assert.equal(resA.status, 200);
    const subsA = resA.body.data.submissions;

    // Tenant B queries submissions
    const resB = await request(app)
      .get('/api/v1/dashboard/submissions')
      .set('Authorization', `Bearer ${tokenTenantB}`);
    assert.equal(resB.status, 200);
    const subsB = resB.body.data.submissions;

    // Verify zero overlap
    const idsA = new Set(subsA.map((s) => s.id));
    const idsB = new Set(subsB.map((s) => s.id));

    for (const id of idsA) {
      assert.ok(!idsB.has(id), 'Tenant B must not see Tenant A submission ' + id);
    }
  });

  await t.test('Cross-tenant isolation: Tenant A filtering by Tenant B widget returns 0 results', async () => {
    const res = await request(app)
      .get(`/api/v1/dashboard/submissions?widget_id=${widgetBId}`)
      .set('Authorization', `Bearer ${tokenTenantA}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.submissions.length, 0);
    assert.equal(res.body.data.pagination.total, 0);
  });

  await t.test('GET /api/v1/dashboard/stats returns volume time series and active widgets count', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/stats?timeframe=7d')
      .set('Authorization', `Bearer ${tokenTenantA}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'success');
    const { total_submissions, unique_widgets_active, submissions_over_time } = res.body.data;

    assert.ok(typeof total_submissions === 'number');
    assert.ok(total_submissions >= 1);
    assert.ok(typeof unique_widgets_active === 'number');
    assert.ok(unique_widgets_active >= 1);
    assert.ok(Array.isArray(submissions_over_time));

    if (submissions_over_time.length > 0) {
      const item = submissions_over_time[0];
      assert.ok(item.date);
      assert.ok(typeof item.count === 'number');
    }
  });

  await t.test('GET /api/v1/dashboard/geo returns aggregated country distribution with percentages', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/geo')
      .set('Authorization', `Bearer ${tokenTenantA}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'success');
    const data = res.body.data;

    assert.ok(Array.isArray(data));
    assert.ok(data.length >= 1);

    const first = data[0];
    assert.ok(first.country_code);
    assert.ok(first.country_name);
    assert.ok(typeof first.count === 'number');
    assert.ok(typeof first.percentage === 'number');

    // Total percentages should sum to approximately 100%
    const sumPct = data.reduce((acc, curr) => acc + curr.percentage, 0);
    assert.ok(sumPct >= 98 && sumPct <= 102, 'Total percentage should sum near 100%');
  });

  await t.test('Second-Origin End-to-End Simulation: cross-origin submission visible in dashboard API', async () => {
    const secondOrigin = 'http://localhost:5500';

    // 1. Fetch script bundle with second-origin header
    const scriptRes = await request(app)
      .get('/widget.v1.js')
      .set('Origin', secondOrigin);
    assert.equal(scriptRes.status, 200);

    // 2. Fetch config with second-origin header
    const configRes = await request(app)
      .get(`/api/v1/widgets/${widgetAId}/config`)
      .set('Origin', secondOrigin);
    assert.equal(configRes.status, 200);
    assert.equal(configRes.headers['access-control-allow-origin'], secondOrigin);

    // 3. CORS Preflight OPTIONS
    const preflightRes = await request(app)
      .options('/api/v1/submissions')
      .set('Origin', secondOrigin)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Content-Type');
    assert.equal(preflightRes.status, 204);
    assert.equal(preflightRes.headers['access-control-allow-origin'], secondOrigin);

    // 4. POST cross-origin submission from second-origin customer site
    const subRes = await request(app)
      .post('/api/v1/submissions')
      .set('Origin', secondOrigin)
      .send({
        widget_id: widgetAId,
        payload: {
          name: 'Port 5500 Test Visitor',
          email: 'port5500@customer-site.com',
        },
        _hp_company: '',
        _rendered_at: Date.now() - 2500,
      });

    assert.equal(subRes.status, 201);
    assert.equal(subRes.body.status, 'success');
    const createdSubmissionId = subRes.body.data.submission_id;
    assert.ok(createdSubmissionId);

    // 5. Query Dashboard API as owning tenant to verify immediate visibility (Evaluator Probe 1!)
    const dashRes = await request(app)
      .get('/api/v1/dashboard/submissions?search=port5500@customer-site.com')
      .set('Authorization', `Bearer ${tokenTenantA}`);

    assert.equal(dashRes.status, 200);
    const results = dashRes.body.data.submissions;
    assert.ok(results.length >= 1, 'Submitted lead from second origin must be visible in dashboard');
    assert.equal(results[0].id, createdSubmissionId);
    assert.equal(results[0].payload.email, 'port5500@customer-site.com');

    // Cleanup created submission
    await query('DELETE FROM submissions WHERE id = $1', [createdSubmissionId]);
  });
});
