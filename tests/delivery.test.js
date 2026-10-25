process.env.NODE_ENV = 'test';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const app = require('../src/app');
const { query, closePool } = require('../src/db');

// Seeded Acme Tenant & Widget IDs
const acmeTenantId = '8d3e4b2a-c1f7-4b2a-89a1-0a1b2c3d4e5f';
const acmeWidgetId = 'e7b4010a-3d96-48c9-94b2-03d6d03d32cb';

let inactiveWidgetId;

before(async () => {
  // Create an inactive widget fixture to verify consistent 404 behavior
  const res = await query(
    `INSERT INTO widgets (
       tenant_id, name, type, title, description, button_text,
       fields_schema, display_rules, is_active
     ) VALUES (
       $1, 'Archived Inactive Widget', 'signup_form', 'Inactive Title', 'Disabled', 'Join',
       '[{"name": "email", "type": "email", "label": "Work Email", "required": true}]'::jsonb,
       '{"theme_color": "#64748b", "position": "bottom-right", "allowed_origins": ["*"]}'::jsonb,
       false
     ) RETURNING id`,
    [acmeTenantId]
  );
  inactiveWidgetId = res.rows[0].id;
});

after(async () => {
  if (inactiveWidgetId) {
    await query('DELETE FROM widgets WHERE id = $1', [inactiveWidgetId]);
  }
  await closePool();
});

test('Widget Delivery & Public Config Pipeline (/widget.v1.js & /api/v1/widgets/:id/config)', async (t) => {
  await t.test('GET /widget.v1.js serves browser-compatible embed script with immutable 1-year cache', async () => {
    const res = await request(app).get('/widget.v1.js');

    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /application\/javascript/);
    assert.equal(res.headers['cache-control'], 'public, max-age=31536000, immutable');
    assert.ok(res.text.includes('FlyRankWidget'), 'Script should expose FlyRankWidget');
    assert.ok(res.text.includes('_hp_company'), 'Script should manage honeypot field');
  });

  await t.test('Immutable 1-year cache header is NOT set on non-versioned endpoints', async () => {
    const res = await request(app).get('/health');
    assert.equal(res.status, 200);
    const cacheControl = res.headers['cache-control'] || '';
    assert.ok(!cacheControl.includes('immutable'), 'Health endpoint must not have immutable cache');
    assert.ok(!cacheControl.includes('max-age=31536000'), 'Health endpoint must not have 1-year cache');
  });

  await t.test('GET /api/v1/widgets/:id/config returns 200 with dynamic 60s cache headers for active widget', async () => {
    const res = await request(app).get(`/api/v1/widgets/${acmeWidgetId}/config`);

    assert.equal(res.status, 200);
    assert.equal(
      res.headers['cache-control'],
      'public, max-age=60, s-maxage=60, stale-while-revalidate=120'
    );
  });

  await t.test('GET /api/v1/widgets/:id/config returns required public fields matching DESIGN.md contract', async () => {
    const res = await request(app).get(`/api/v1/widgets/${acmeWidgetId}/config`);

    assert.equal(res.status, 200);
    const body = res.body;

    // Direct object / data container compatibility
    const config = body.data || body;
    assert.equal(config.id, acmeWidgetId);
    assert.equal(config.type, 'signup_form');
    assert.equal(config.title, 'Stay Ahead with Acme Insights');
    assert.ok(config.description);
    assert.equal(config.button_text, 'Subscribe Now');
    assert.ok(Array.isArray(config.fields), 'Fields must be an array');
    assert.ok(config.fields.length >= 2, 'Should include configured fields');
    assert.ok(config.display, 'Display config must be present');
    assert.equal(config.display.position, 'bottom-right');
    assert.equal(config.display.theme_color, '#2563eb');
  });

  await t.test('GET /api/v1/widgets/:id/config strictly excludes sensitive tenant and internal fields', async () => {
    const res = await request(app).get(`/api/v1/widgets/${acmeWidgetId}/config`);

    assert.equal(res.status, 200);
    const body = res.body;
    const config = body.data || body;

    // Verify zero sensitive leaks
    assert.equal(config.tenant_id, undefined, 'Must NEVER expose tenant_id');
    assert.equal(body.tenant_id, undefined, 'Must NEVER expose tenant_id');
    assert.equal(config.created_at, undefined, 'Must NOT expose created_at');
    assert.equal(config.updated_at, undefined, 'Must NOT expose updated_at');
    assert.equal(config.display.allowed_origins, undefined, 'Must NOT expose internal allowed_origins');
  });

  await t.test('GET /api/v1/widgets/:id/config returns 404 for non-existent widget UUID', async () => {
    const nonExistentUuid = '99999999-9999-4999-8999-999999999999';
    const res = await request(app).get(`/api/v1/widgets/${nonExistentUuid}/config`);

    assert.equal(res.status, 404);
    assert.equal(res.body.code, 'WIDGET_NOT_FOUND');
  });

  await t.test('GET /api/v1/widgets/:id/config returns consistent 404 for inactive widget (no probing leak)', async () => {
    const res = await request(app).get(`/api/v1/widgets/${inactiveWidgetId}/config`);

    assert.equal(res.status, 404);
    assert.equal(res.body.code, 'WIDGET_NOT_FOUND');
  });

  await t.test('GET /api/v1/widgets/:id/config validates UUID format and rejects invalid IDs with 400', async () => {
    const res = await request(app).get('/api/v1/widgets/not-a-valid-uuid/config');

    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'VALIDATION_ERROR');
  });

  await t.test('Public config endpoint supports CORS for cross-origin callers', async () => {
    const res = await request(app)
      .get(`/api/v1/widgets/${acmeWidgetId}/config`)
      .set('Origin', 'http://localhost:5500');

    assert.equal(res.status, 200);
    assert.equal(res.headers['access-control-allow-origin'], 'http://localhost:5500');
  });

  await t.test('Embed script renders form with accessible labels and theme in DOM environment', async () => {
    const scriptPath = path.join(__dirname, '../src/public/widget.v1.js');
    const scriptCode = fs.readFileSync(scriptPath, 'utf8');

    // Create simulated DOM environment
    const dom = new JSDOM('<!DOCTYPE html><html><body><div id="mount-point"></div></body></html>', {
      runScripts: 'outside-only',
      url: 'http://localhost:5500/test.html',
    });

    // Execute widget script inside DOM window
    dom.window.eval(scriptCode);

    assert.ok(dom.window.FlyRankWidget, 'window.FlyRankWidget must be defined');

    const config = {
      id: acmeWidgetId,
      type: 'signup_form',
      title: 'Acme Test Title',
      description: 'Acme Test Description',
      button_text: 'Join Waitlist',
      fields: [
        { name: 'name', type: 'text', label: 'Full Name', required: true },
        { name: 'email', type: 'email', label: 'Work Email', required: true },
        { name: 'company', type: 'text', label: 'Organization', required: false },
      ],
      display: {
        position: 'inline',
        theme_color: '#059669',
      },
    };

    const container = dom.window.document.getElementById('mount-point');
    const rendered = dom.window.FlyRankWidget.renderWidget(config, acmeWidgetId, 'http://localhost:3000', container);

    const root = rendered.root;
    // Verify Accessible Title & Description
    const titleEl = root.querySelector('.flyrank-title');
    assert.ok(titleEl, 'Title element must exist');
    assert.equal(titleEl.textContent, 'Acme Test Title');

    const descEl = root.querySelector('.flyrank-description');
    assert.ok(descEl, 'Description element must exist');
    assert.equal(descEl.textContent, 'Acme Test Description');

    // Verify Accessible Labels and Form Controls
    const nameLabel = root.querySelector('label[for="flyrank-' + acmeWidgetId + '-name"]');
    assert.ok(nameLabel, 'Accessible label linked to name input must exist');
    assert.ok(nameLabel.textContent.includes('Full Name'));

    const nameInput = root.querySelector('input[name="name"]');
    assert.ok(nameInput, 'Name input must exist');
    assert.equal(nameInput.getAttribute('required'), 'true');
    assert.equal(nameInput.getAttribute('aria-required'), 'true');

    const emailInput = root.querySelector('input[name="email"]');
    assert.ok(emailInput, 'Email input must exist');
    assert.equal(emailInput.type, 'email');
    assert.equal(emailInput.getAttribute('autocomplete'), 'email');

    // Verify Honeypot field exists and is hidden
    const hpInput = root.querySelector('input[name="_hp_company"]');
    assert.ok(hpInput, 'Honeypot field must exist');
    assert.equal(hpInput.style.display, 'none');

    // Verify Submit Button and Theme Color
    const submitBtn = root.querySelector('button[type="submit"]');
    assert.ok(submitBtn, 'Submit button must exist');
    assert.equal(submitBtn.textContent, 'Join Waitlist');
    assert.equal(submitBtn.style.backgroundColor, 'rgb(5, 150, 105)'); // #059669 in RGB
  });

  await t.test('Embed script client-side validation prevents submit with empty required fields', async () => {
    const scriptPath = path.join(__dirname, '../src/public/widget.v1.js');
    const scriptCode = fs.readFileSync(scriptPath, 'utf8');

    const dom = new JSDOM('<!DOCTYPE html><html><body><div id="mount-val"></div></body></html>', {
      runScripts: 'outside-only',
      url: 'http://localhost:5500/test.html',
    });

    dom.window.eval(scriptCode);

    const config = {
      id: acmeWidgetId,
      title: 'Validation Test',
      button_text: 'Submit',
      fields: [{ name: 'email', type: 'email', label: 'Email Address', required: true }],
      display: { theme_color: '#2563eb' },
    };

    let fetchCalled = false;
    dom.window.fetch = async () => {
      fetchCalled = true;
      return { ok: true, status: 201, json: async () => ({ status: 'success' }) };
    };

    const container = dom.window.document.getElementById('mount-val');
    const rendered = dom.window.FlyRankWidget.renderWidget(config, acmeWidgetId, 'http://localhost:3000', container);

    const form = rendered.form;
    const statusMsg = form.querySelector('.flyrank-status-message');

    // Submit without filling email
    form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));

    assert.equal(fetchCalled, false, 'Fetch must not be called when required fields are empty');
    assert.ok(statusMsg.textContent.includes('required'), 'Validation error must be displayed in status area');
    assert.ok(statusMsg.className.includes('flyrank-error'));
  });

  await t.test('Embed script client-side validation detects invalid email format', async () => {
    const scriptPath = path.join(__dirname, '../src/public/widget.v1.js');
    const scriptCode = fs.readFileSync(scriptPath, 'utf8');

    const dom = new JSDOM('<!DOCTYPE html><html><body><div id="mount-email"></div></body></html>', {
      runScripts: 'outside-only',
      url: 'http://localhost:5500/test.html',
    });

    dom.window.eval(scriptCode);

    const config = {
      id: acmeWidgetId,
      title: 'Email Format Test',
      button_text: 'Submit',
      fields: [{ name: 'email', type: 'email', label: 'Work Email', required: true }],
      display: { theme_color: '#2563eb' },
    };

    let fetchCalled = false;
    dom.window.fetch = async () => {
      fetchCalled = true;
      return { ok: true, status: 201, json: async () => ({ status: 'success' }) };
    };

    const container = dom.window.document.getElementById('mount-email');
    const rendered = dom.window.FlyRankWidget.renderWidget(config, acmeWidgetId, 'http://localhost:3000', container);

    const form = rendered.form;
    const emailInput = form.querySelector('input[name="email"]');
    emailInput.value = 'invalid-email-not-an-address';

    form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));

    assert.equal(fetchCalled, false, 'Fetch must not be called with invalid email');
    const statusMsg = form.querySelector('.flyrank-status-message');
    assert.ok(statusMsg.textContent.includes('valid email'), 'Must report invalid email format error');
  });

  await t.test('Embed script handles successful submission flow with inline success state', async () => {
    const scriptPath = path.join(__dirname, '../src/public/widget.v1.js');
    const scriptCode = fs.readFileSync(scriptPath, 'utf8');

    const dom = new JSDOM('<!DOCTYPE html><html><body><div id="mount-success"></div></body></html>', {
      runScripts: 'outside-only',
      url: 'http://localhost:5500/test.html',
    });

    dom.window.eval(scriptCode);

    const config = {
      id: acmeWidgetId,
      title: 'Success Flow Test',
      button_text: 'Send',
      fields: [
        { name: 'name', type: 'text', label: 'Name', required: true },
        { name: 'email', type: 'email', label: 'Email', required: true },
      ],
      display: { theme_color: '#2563eb' },
    };

    let capturedRequestBody = null;
    dom.window.fetch = async (url, options) => {
      capturedRequestBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 201,
        json: async () => ({
          status: 'success',
          message: 'Submission recorded successfully',
          data: { submission_id: 'sub-12345' },
        }),
      };
    };

    const container = dom.window.document.getElementById('mount-success');
    const rendered = dom.window.FlyRankWidget.renderWidget(config, acmeWidgetId, 'http://localhost:3000', container);

    const form = rendered.form;
    form.querySelector('input[name="name"]').value = 'Jane Developer';
    form.querySelector('input[name="email"]').value = 'jane@example.com';

    form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));

    // Wait a tick for microtask resolution
    await new Promise((r) => setTimeout(r, 50));

    // Verify submission contract
    assert.ok(capturedRequestBody, 'Fetch must have been called with payload');
    assert.equal(capturedRequestBody.widget_id, acmeWidgetId);
    assert.equal(capturedRequestBody.payload.name, 'Jane Developer');
    assert.equal(capturedRequestBody.payload.email, 'jane@example.com');
    assert.equal(capturedRequestBody._hp_company, '');
    assert.ok(typeof capturedRequestBody._rendered_at === 'number');

    // Verify Form is hidden and Success Alert is rendered
    assert.equal(form.style.display, 'none', 'Form must be hidden on success');
    const successCard = rendered.card.querySelector('.flyrank-success-state');
    assert.ok(successCard, 'Success card must be rendered in DOM');
    assert.equal(successCard.getAttribute('role'), 'alert');
    assert.ok(successCard.textContent.includes('Thank you!'));
  });
});
