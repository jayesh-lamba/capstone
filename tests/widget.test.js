const { test, after, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../src/app');
const { closePool } = require('../src/db');

let tokenA; // Acme Corp
let tokenB; // Beta Ltd
const betaWidgetId = '22222222-3333-4444-5555-666666666666'; // Seeded under Beta Ltd
let createdWidgetIdA;

before(async () => {
  // Login as Tenant A (Acme Corp)
  const resA = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'admin@acme.com', password: 'SecurePassword123!' });
  tokenA = resA.body.data.token;

  // Login as Tenant B (Beta Ltd)
  const resB = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'owner@beta.com', password: 'BetaSecret123!' });
  tokenB = resB.body.data.token;
});

after(async () => {
  await closePool();
});

test('Widget Management & Multi-Tenant Isolation API (/api/v1/widgets)', async (t) => {
  await t.test('GET /api/v1/widgets without token returns 401 UNAUTHORIZED', async () => {
    const res = await request(app).get('/api/v1/widgets');
    assert.equal(res.status, 401);
    assert.equal(res.body.status, 'error');
    assert.equal(res.body.error.code, 'UNAUTHORIZED');
  });

  await t.test('GET /api/v1/widgets with invalid token returns 401 INVALID_TOKEN', async () => {
    const res = await request(app)
      .get('/api/v1/widgets')
      .set('Authorization', 'Bearer invalid.token.signature');
    assert.equal(res.status, 401);
    assert.equal(res.body.status, 'error');
    assert.equal(res.body.error.code, 'INVALID_TOKEN');
  });

  await t.test('GET /api/v1/widgets for Tenant A returns only Tenant A widgets', async () => {
    const res = await request(app)
      .get('/api/v1/widgets')
      .set('Authorization', `Bearer ${tokenA}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'success');
    assert.ok(Array.isArray(res.body.data));
    assert.ok(res.body.data.length >= 1);

    // Verify all returned widgets belong to Tenant A and none have Beta's widget ID
    const hasBetaWidget = res.body.data.some((w) => w.id === betaWidgetId);
    assert.equal(hasBetaWidget, false, 'Tenant A must never see Tenant B widgets in listing');
  });

  await t.test('POST /api/v1/widgets creates widget and returns embed snippet', async () => {
    const res = await request(app)
      .post('/api/v1/widgets')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Product Launch Signup',
        type: 'signup_form',
        title: 'Join the Beta',
        description: 'Get notified as soon as we launch.',
        button_text: 'Join Now',
        fields_schema: [
          { name: 'email', type: 'email', label: 'Work Email', required: true },
          { name: 'full_name', type: 'text', label: 'Full Name', required: true },
        ],
        display_rules: {
          position: 'bottom-right',
          theme_color: '#0ea5e9',
          allowed_origins: ['http://localhost:5500'],
        },
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.status, 'success');
    assert.ok(res.body.data.id);
    assert.equal(res.body.data.title, 'Join the Beta');
    assert.ok(res.body.data.embed_snippet.includes(res.body.data.id));
    assert.ok(res.body.data.embed_snippet.startsWith('<script src='));

    createdWidgetIdA = res.body.data.id;
  });

  await t.test('POST /api/v1/widgets with invalid field schema returns 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/v1/widgets')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Bad Widget',
        title: 'Missing Fields',
        fields_schema: [], // Empty array not allowed
      });

    assert.equal(res.status, 400);
    assert.equal(res.body.status, 'error');
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  await t.test('POST /api/v1/widgets with invalid theme color returns 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/v1/widgets')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Bad Color Widget',
        title: 'Color Test',
        fields_schema: [{ name: 'email', type: 'email', label: 'Email', required: true }],
        display_rules: {
          theme_color: 'not-a-hex-color',
        },
      });

    assert.equal(res.status, 400);
    assert.equal(res.body.status, 'error');
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  await t.test('GET /api/v1/widgets/:id returns widget for authorized owner', async () => {
    const res = await request(app)
      .get(`/api/v1/widgets/${createdWidgetIdA}`)
      .set('Authorization', `Bearer ${tokenA}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'success');
    assert.equal(res.body.data.id, createdWidgetIdA);
    assert.equal(res.body.data.name, 'Product Launch Signup');
  });

  await t.test('GET /api/v1/widgets/:id with invalid UUID format returns 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .get('/api/v1/widgets/not-a-valid-uuid')
      .set('Authorization', `Bearer ${tokenA}`);

    assert.equal(res.status, 400);
    assert.equal(res.body.status, 'error');
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  await t.test('GET /api/v1/widgets/:id/snippet returns ready-to-paste script tag', async () => {
    const res = await request(app)
      .get(`/api/v1/widgets/${createdWidgetIdA}/snippet`)
      .set('Authorization', `Bearer ${tokenA}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'success');
    assert.equal(res.body.data.widget_id, createdWidgetIdA);
    assert.ok(res.body.data.embed_snippet.includes(createdWidgetIdA));
  });

  await t.test('PUT /api/v1/widgets/:id updates widget fields', async () => {
    const res = await request(app)
      .put(`/api/v1/widgets/${createdWidgetIdA}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        title: 'Updated Beta Program Title',
        button_text: 'Get Instant Access',
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'success');
    assert.equal(res.body.data.title, 'Updated Beta Program Title');
    assert.equal(res.body.data.button_text, 'Get Instant Access');
  });

  // MULTI-TENANT ISOLATION TESTS
  await t.test('Tenant A cannot read Tenant B widget (GET returns 404 WIDGET_NOT_FOUND)', async () => {
    const res = await request(app)
      .get(`/api/v1/widgets/${betaWidgetId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    assert.equal(res.status, 404);
    assert.equal(res.body.status, 'error');
    assert.equal(res.body.error.code, 'WIDGET_NOT_FOUND');
  });

  await t.test('Tenant A cannot update Tenant B widget (PUT returns 404 WIDGET_NOT_FOUND)', async () => {
    const res = await request(app)
      .put(`/api/v1/widgets/${betaWidgetId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        title: 'Hacked by Tenant A',
      });

    assert.equal(res.status, 404);
    assert.equal(res.body.status, 'error');
    assert.equal(res.body.error.code, 'WIDGET_NOT_FOUND');
  });

  await t.test('Tenant A cannot get snippet for Tenant B widget (GET snippet returns 404 WIDGET_NOT_FOUND)', async () => {
    const res = await request(app)
      .get(`/api/v1/widgets/${betaWidgetId}/snippet`)
      .set('Authorization', `Bearer ${tokenA}`);

    assert.equal(res.status, 404);
    assert.equal(res.body.status, 'error');
    assert.equal(res.body.error.code, 'WIDGET_NOT_FOUND');
  });

  await t.test('Tenant A cannot delete Tenant B widget (DELETE returns 404 WIDGET_NOT_FOUND)', async () => {
    const res = await request(app)
      .delete(`/api/v1/widgets/${betaWidgetId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    assert.equal(res.status, 404);
    assert.equal(res.body.status, 'error');
    assert.equal(res.body.error.code, 'WIDGET_NOT_FOUND');
  });

  await t.test('DELETE /api/v1/widgets/:id allows Tenant A to delete own widget', async () => {
    const res = await request(app)
      .delete(`/api/v1/widgets/${createdWidgetIdA}`)
      .set('Authorization', `Bearer ${tokenA}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'success');

    // Confirm widget is gone
    const verifyRes = await request(app)
      .get(`/api/v1/widgets/${createdWidgetIdA}`)
      .set('Authorization', `Bearer ${tokenA}`);
    assert.equal(verifyRes.status, 404);
  });
});
