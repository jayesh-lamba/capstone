const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../src/app');
const { closePool } = require('../src/db');

after(async () => {
  await closePool();
});

test('Health & Infrastructure Probes', async (t) => {
  await t.test('GET / returns 200 with API metadata', async () => {
    const res = await request(app).get('/');
    assert.equal(res.status, 200);
    assert.equal(res.body.name, 'FlyRank Embeddable Widget Platform API');
    assert.equal(res.body.status, 'online');
  });

  await t.test('GET /health returns structured health check status', async () => {
    const res = await request(app).get('/health');
    // Status can be 200 (if DB connected) or 503 (if DB offline in unit test environment)
    assert.ok([200, 503].includes(res.status), `Unexpected status code: ${res.status}`);
    assert.ok(['ok', 'degraded'].includes(res.body.status));
    assert.equal(typeof res.body.uptimeSeconds, 'number');
    assert.ok(res.body.checks && res.body.checks.database);
    assert.ok(['healthy', 'unhealthy'].includes(res.body.checks.database.status));
  });

  await t.test('GET /non-existent-route returns 404 with JSON envelope', async () => {
    const res = await request(app).get('/non-existent-route');
    assert.equal(res.status, 404);
    assert.equal(res.body.status, 'error');
    assert.equal(res.body.error.code, 'NOT_FOUND');
  });

  await t.test('POST /health with malformed JSON body returns 400 INVALID_JSON', async () => {
    const res = await request(app)
      .post('/health')
      .set('Content-Type', 'application/json')
      .send('{"bad_json": ');
    assert.equal(res.status, 400);
    assert.equal(res.body.status, 'error');
    assert.equal(res.body.error.code, 'INVALID_JSON');
  });
});
