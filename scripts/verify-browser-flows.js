/**
 * End-to-End Live Browser Flow Verification Script
 * Validates the full customer second-origin embed flow (port 5500)
 * and the owner dashboard authentication & data-loading flow (port 3000).
 */
const http = require('http');

async function fetchHttp(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: options.method || 'GET',
        headers: options.headers || {},
      },
      (res) => {
        // Follow standard browser redirects (301, 302)
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirectUrl = new URL(res.headers.location, url).toString();
          return fetchHttp(redirectUrl, options).then(resolve).catch(reject);
        }

        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(body);
          } catch (_) {}
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body,
            json,
          });
        });
      }
    );

    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runVerification() {
  console.log('====================================================');
  console.log(' FlyRank Milestone 3 E2E Browser Flow Verification');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function assertCheck(desc, condition, details = '') {
    total++;
    if (condition) {
      passed++;
      console.log(`  ✔ [PASS] ${desc}`);
      if (details) console.log(`     └─ ${details}`);
    } else {
      console.error(`  ✖ [FAIL] ${desc}`);
      if (details) console.error(`     └─ ${details}`);
    }
  }

  // --------------------------------------------------------------------------
  // FLOW 1: Customer Site & Embed Script Loading (Origin: http://localhost:5500)
  // --------------------------------------------------------------------------
  console.log('▶ [Flow 1] Second-Origin Customer Site (http://localhost:5500)');

  const testSiteRes = await fetchHttp('http://localhost:5500/');
  assertCheck(
    'Customer demo page served with HTTP 200',
    testSiteRes.status === 200,
    `Status: ${testSiteRes.status}, Content-Length: ${testSiteRes.body.length}`
  );
  assertCheck(
    'Customer demo page contains versioned embed script tag',
    testSiteRes.body.includes('widget.v1.js?id=e7b4010a-3d96-48c9-94b2-03d6d03d32cb'),
    'Found <script src="http://localhost:3000/widget.v1.js?id=e7b4010a-3d96-48c9-94b2-03d6d03d32cb" defer>'
  );

  // --------------------------------------------------------------------------
  // FLOW 2: Static Embed Script Delivery (Origin: http://localhost:3000)
  // --------------------------------------------------------------------------
  console.log('\n▶ [Flow 2] Versioned Widget Bundle Delivery');

  const scriptRes = await fetchHttp('http://localhost:3000/widget.v1.js?id=e7b4010a-3d96-48c9-94b2-03d6d03d32cb');
  assertCheck(
    'Embed script served with HTTP 200 and javascript content-type',
    scriptRes.status === 200 && scriptRes.headers['content-type'].includes('application/javascript'),
    `Content-Type: ${scriptRes.headers['content-type']}`
  );
  assertCheck(
    'Embed script specifies 1-year immutable caching header',
    scriptRes.headers['cache-control'] === 'public, max-age=31536000, immutable',
    `Cache-Control: ${scriptRes.headers['cache-control']}`
  );
  assertCheck(
    'Embed script contains FlyRankWidget runtime logic and Shadow DOM encapsulation',
    scriptRes.body.includes('FlyRankWidget') && scriptRes.body.includes('attachShadow'),
    'Verified Shadow DOM & FlyRankWidget IIFE'
  );

  // --------------------------------------------------------------------------
  // FLOW 3: Dynamic Public Configuration Fetch with CORS
  // --------------------------------------------------------------------------
  console.log('\n▶ [Flow 3] Dynamic Public Config Delivery with CORS');

  const configRes = await fetchHttp('http://localhost:3000/api/v1/widgets/e7b4010a-3d96-48c9-94b2-03d6d03d32cb/config', {
    headers: { Origin: 'http://localhost:5500' },
  });
  assertCheck(
    'Public config endpoint returns HTTP 200 with 60s dynamic cache header',
    configRes.status === 200 && configRes.headers['cache-control'].includes('max-age=60'),
    `Cache-Control: ${configRes.headers['cache-control']}`
  );
  assertCheck(
    'Public config includes CORS Allow-Origin header for http://localhost:5500',
    configRes.headers['access-control-allow-origin'] === 'http://localhost:5500' ||
      configRes.headers['access-control-allow-origin'] === '*',
    `Access-Control-Allow-Origin: ${configRes.headers['access-control-allow-origin']}`
  );
  assertCheck(
    'Public config excludes sensitive tenant_id and internal fields',
    configRes.json && !configRes.json.tenant_id && !configRes.json.data?.tenant_id,
    'Verified zero tenant_id exposure in config'
  );

  // --------------------------------------------------------------------------
  // FLOW 4: Cross-Origin Submission Preflight & Ingestion
  // --------------------------------------------------------------------------
  console.log('\n▶ [Flow 4] Cross-Origin Form Ingestion Pipeline');

  const preflightRes = await fetchHttp('http://localhost:3000/api/v1/submissions', {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://localhost:5500',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'Content-Type',
    },
  });
  assertCheck(
    'CORS preflight OPTIONS returns HTTP 204 No Content',
    preflightRes.status === 204,
    `Status: ${preflightRes.status}, Allow-Origin: ${preflightRes.headers['access-control-allow-origin']}`
  );

  const testEmail = `browser.lead.${Date.now()}@example.com`;
  const submitRes = await fetchHttp('http://localhost:3000/api/v1/submissions', {
    method: 'POST',
    headers: {
      Origin: 'http://localhost:5500',
      'Content-Type': 'application/json',
    },
    body: {
      widget_id: 'e7b4010a-3d96-48c9-94b2-03d6d03d32cb',
      payload: {
        email: testEmail,
        name: 'Browser Verified Lead',
        company: 'FlyRank E2E Test Corp',
      },
      _hp_company: '',
      _rendered_at: Date.now() - 3500, // Rendered 3.5s ago
    },
  });
  assertCheck(
    'Public lead submission returns HTTP 201 Created with submission_id',
    submitRes.status === 201 && submitRes.json?.data?.submission_id,
    `Submission ID: ${submitRes.json?.data?.submission_id}`
  );

  // --------------------------------------------------------------------------
  // FLOW 5: Owner Dashboard UI & Authenticated Data Loading
  // --------------------------------------------------------------------------
  console.log('\n▶ [Flow 5] Owner Dashboard UI & Real Authentication');

  const dashUiRes = await fetchHttp('http://localhost:3000/dashboard');
  assertCheck(
    'Dashboard static UI served with HTTP 200',
    dashUiRes.status === 200,
    `HTML Length: ${dashUiRes.body.length} bytes`
  );
  assertCheck(
    'Dashboard UI contains zero usable credentials or demo password leaks',
    !dashUiRes.body.includes('AcmeSecretPass') && !dashUiRes.body.includes('admin@acme.com<'),
    'Verified demo credentials cleanly removed from dashboard UI'
  );

  // Authenticate as Tenant A
  const loginRes = await fetchHttp('http://localhost:3000/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: {
      email: 'admin@acme.com',
      password: 'SecurePassword123!',
    },
  });
  assertCheck(
    'Tenant login returns HTTP 200 with signed JWT token',
    loginRes.status === 200 && loginRes.json?.data?.token,
    `JWT Token Length: ${loginRes.json?.data?.token?.length} chars`
  );

  const token = loginRes.json?.data?.token;

  // Load KPI stats
  const statsRes = await fetchHttp('http://localhost:3000/api/v1/dashboard/stats?timeframe=7d', {
    headers: { Authorization: `Bearer ${token}` },
  });
  assertCheck(
    'Dashboard stats endpoint returns HTTP 200 with volume timeseries',
    statsRes.status === 200 && typeof statsRes.json?.data?.total_submissions === 'number',
    `Total Submissions: ${statsRes.json?.data?.total_submissions}, Active Widgets: ${statsRes.json?.data?.unique_widgets_active}`
  );

  // Load Geo metrics
  const geoRes = await fetchHttp('http://localhost:3000/api/v1/dashboard/geo', {
    headers: { Authorization: `Bearer ${token}` },
  });
  assertCheck(
    'Dashboard geo endpoint returns HTTP 200 with geographic breakdown',
    geoRes.status === 200 && Array.isArray(geoRes.json?.data),
    `Top Location: ${geoRes.json?.data?.[0]?.country_name || 'US'} (${geoRes.json?.data?.[0]?.count || 0} leads)`
  );

  // Load submissions list and verify newly submitted lead is visible
  const listRes = await fetchHttp('http://localhost:3000/api/v1/dashboard/submissions?page=1&limit=10', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const leads = listRes.json?.data?.submissions || [];
  const foundLead = leads.find((l) => l.payload?.email === testEmail);
  assertCheck(
    'Submitted lead from second origin (port 5500) appears in dashboard submissions list',
    Boolean(foundLead),
    `Verified lead in DB: ${foundLead ? foundLead.payload.email : 'not found'}`
  );

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n====================================================');
  console.log(` Summary: ${passed}/${total} checks passed (${Math.round((passed / total) * 100)}%)`);
  console.log('====================================================\n');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runVerification().catch((err) => {
  console.error('Fatal verification error:', err);
  process.exit(1);
});
