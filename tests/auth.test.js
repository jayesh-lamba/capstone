const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../src/app');
const { closePool } = require('../src/db');

after(async () => {
  await closePool();
});

test('Authentication API (/api/v1/auth)', async (t) => {
  await t.test('POST /login with valid seeded credentials returns 200 and JWT', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'admin@acme.com',
        password: 'SecurePassword123!',
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'success');
    assert.ok(res.body.data.token, 'Expected JWT token in response');
    assert.equal(res.body.data.tenant_id, '8d3e4b2a-c1f7-4b2a-89a1-0a1b2c3d4e5f');
    assert.equal(res.body.data.password, undefined);
    assert.equal(res.body.data.password_hash, undefined);
  });

  await t.test('POST /login with incorrect password returns 401 INVALID_CREDENTIALS', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'admin@acme.com',
        password: 'WrongPassword!',
      });

    assert.equal(res.status, 401);
    assert.equal(res.body.status, 'error');
    assert.equal(res.body.error.code, 'INVALID_CREDENTIALS');
  });

  await t.test('POST /login with unknown user returns 401 INVALID_CREDENTIALS', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'nobody@nowhere.com',
        password: 'SomePassword123!',
      });

    assert.equal(res.status, 401);
    assert.equal(res.body.status, 'error');
    assert.equal(res.body.error.code, 'INVALID_CREDENTIALS');
  });

  await t.test('POST /login with invalid email format returns 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'not-an-email',
        password: 'Password123!',
      });

    assert.equal(res.status, 400);
    assert.equal(res.body.status, 'error');
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  await t.test('POST /register with valid data creates tenant, user, and returns JWT', async () => {
    const uniqueEmail = `owner_${Date.now()}@newtenant.com`;
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        tenant_name: 'Gamma Systems',
        email: uniqueEmail,
        password: 'GammaPassword123!',
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.status, 'success');
    assert.ok(res.body.data.user_id);
    assert.ok(res.body.data.tenant_id);
    assert.equal(res.body.data.email, uniqueEmail);
    assert.ok(res.body.data.token);
    assert.equal(res.body.data.password, undefined);
    assert.equal(res.body.data.password_hash, undefined);
  });

  await t.test('POST /register with existing email returns 409 EMAIL_ALREADY_EXISTS', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        tenant_name: 'Duplicate Tenant',
        email: 'admin@acme.com',
        password: 'Password123!',
      });

    assert.equal(res.status, 409);
    assert.equal(res.body.status, 'error');
    assert.equal(res.body.error.code, 'EMAIL_ALREADY_EXISTS');
  });

  await t.test('POST /register with short password returns 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        tenant_name: 'Short Pass Co',
        email: 'shortpass@example.com',
        password: 'short',
      });

    assert.equal(res.status, 400);
    assert.equal(res.body.status, 'error');
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });
});
