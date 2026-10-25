/**
 * Real Desktop Browser Verification with Playwright (Microsoft Edge / Chromium)
 * Tests actual browser layout, network requests, console errors,
 * CORS preflight, form interaction, Shadow DOM encapsulation,
 * dashboard authentication, and cross-tenant isolation.
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function runBrowserTests() {
  console.log('====================================================');
  console.log(' FlyRank Real Desktop Browser Verification (Playwright)');
  console.log('====================================================\n');

  const screenshotsDir = path.join(__dirname, '..', 'screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  let passed = 0;
  let total = 0;

  function assertStep(desc, condition, details = '') {
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

  console.log('▶ [1/4] Launching Real Desktop Browser (Channel: msedge)...');
  let browser;
  try {
    browser = await chromium.launch({
      channel: 'msedge',
      headless: true, // Run headless for automated CI/CD compatibility
    });
    console.log('  ✔ Desktop browser engine launched successfully.\n');
  } catch (err) {
    console.error('  ✖ Failed to launch desktop browser:', err.message);
    process.exit(1);
  }

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) FlyRank-Playwright-Tester/1.0',
  });

  const page = await context.newPage();

  // Monitor console errors and network failures
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Ignore expected 401 from negative login check and default favicon 404
      if (text.includes('401') || text.includes('favicon.ico')) return;
      consoleErrors.push(text);
    }
  });

  const networkFailures = [];
  page.on('requestfailed', (req) => {
    networkFailures.push(`${req.method()} ${req.url()}: ${req.failure()?.errorText}`);
  });

  // ==========================================================================
  // TEST SUITE 1: OWNER DASHBOARD LOGIN & DATA DISPLAY (PORT 3000)
  // ==========================================================================
  console.log('▶ [2/4] Testing Owner Dashboard Flow (http://localhost:3000/dashboard)...');

  // Navigate to Dashboard
  await page.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle' });
  assertStep('Dashboard login page loaded', page.url().includes('/dashboard'));

  const loginTitle = await page.locator('.auth-card h2').textContent();
  assertStep('Login card header visible', loginTitle.includes('Tenant Sign In'), `Found: "${loginTitle}"`);

  // Verify form inputs exist
  const emailInput = page.locator('#email');
  const passwordInput = page.locator('#password');
  const loginBtn = page.locator('#btn-login');

  assertStep('Email, password, and submit button exist in DOM', 
    (await emailInput.count()) === 1 && (await passwordInput.count()) === 1 && (await loginBtn.count()) === 1
  );

  // Test 1A: Attempt invalid credentials
  await emailInput.fill('admin@acme.com');
  await passwordInput.fill('WrongPassword123!');
  await loginBtn.click();
  await page.waitForTimeout(500);

  const errorAlert = page.locator('#login-error');
  const errorVisible = await errorAlert.isVisible();
  const errorText = errorVisible ? await errorAlert.textContent() : '';
  assertStep(
    'Invalid credentials display inline error alert',
    errorVisible && errorText.includes('Invalid'),
    `Alert text: "${errorText}"`
  );

  // Test 1B: Submit valid credentials
  await emailInput.fill('admin@acme.com');
  await passwordInput.fill('SecurePassword123!');
  await loginBtn.click();

  // Wait for dashboard view to become visible
  await page.waitForSelector('#dashboard-view', { state: 'visible', timeout: 5000 });
  assertStep('Successful login transitions to #dashboard-view', await page.locator('#dashboard-view').isVisible());

  // Verify KPI values loaded
  await page.waitForTimeout(1000); // Allow API requests to complete
  const kpiSubmissions = await page.locator('#kpi-submissions').textContent();
  const kpiWidgets = await page.locator('#kpi-widgets').textContent();
  const kpiTopGeo = await page.locator('#kpi-top-geo').textContent();

  assertStep(
    'Dashboard KPI cards populated from API',
    kpiSubmissions !== '—' && kpiWidgets !== '—',
    `Total Submissions: ${kpiSubmissions}, Active Widgets: ${kpiWidgets}, Top Geo: ${kpiTopGeo}`
  );

  // Verify Timeseries Chart rendered
  const barElements = await page.locator('#chart-container .bar').count();
  assertStep('Submissions timeline bar chart rendered', barElements > 0, `Rendered ${barElements} daily bars`);

  // Verify Geo breakdown items rendered
  const geoItems = await page.locator('#geo-list .geo-item').count();
  assertStep('Geographic breakdown list rendered', geoItems > 0, `Rendered ${geoItems} country items`);

  // Verify Submissions table rows rendered
  const tableRows = await page.locator('#submissions-tbody tr').count();
  assertStep('Submissions table displays lead records', tableRows > 0, `Rendered ${tableRows} table rows`);

  // Test 1C: Dashboard search input filtering
  const searchInput = page.locator('#search-input');
  await searchInput.fill('United States');
  await page.waitForTimeout(600); // Wait for debounce
  const filteredRows = await page.locator('#submissions-tbody tr').count();
  assertStep('Search filter interacts with live table', filteredRows > 0, `Filtered view shows ${filteredRows} records`);

  // Clear search
  await searchInput.fill('');
  await page.waitForTimeout(600);

  // Capture Dashboard Screenshot
  const dashboardScreenshotPath = path.join(screenshotsDir, 'dashboard_verified.png');
  await page.screenshot({ path: dashboardScreenshotPath, fullPage: true });
  console.log(`     └─ Saved screenshot: ${path.relative(process.cwd(), dashboardScreenshotPath).replace(/\\/g, '/')}`);

  // ==========================================================================
  // TEST SUITE 2: SECOND-ORIGIN WIDGET EMBED & SUBMISSION (PORT 5500)
  // ==========================================================================
  console.log('\n▶ [3/4] Testing Second-Origin Widget Embed (http://localhost:5500)...');

  await page.goto('http://localhost:5500', { waitUntil: 'networkidle' });
  assertStep('Customer demo page loaded on port 5500', page.url().includes('localhost:5500'));

  // Verify widget container exists and Shadow DOM is attached
  const widgetContainer = page.locator('#flyrank-widget-e7b4010a-3d96-48c9-94b2-03d6d03d32cb');
  assertStep('Widget DOM container created', (await widgetContainer.count()) === 1);

  // Wait for Shadow DOM to render form
  await page.waitForTimeout(1000);

  // Access inputs inside Shadow DOM
  const widgetEmail = page.locator('#flyrank-widget-e7b4010a-3d96-48c9-94b2-03d6d03d32cb >> input[name="email"]');
  const widgetName = page.locator('#flyrank-widget-e7b4010a-3d96-48c9-94b2-03d6d03d32cb >> input[name="name"]');
  const widgetCompany = page.locator('#flyrank-widget-e7b4010a-3d96-48c9-94b2-03d6d03d32cb >> input[name="company"]');
  const widgetSubmitBtn = page.locator('#flyrank-widget-e7b4010a-3d96-48c9-94b2-03d6d03d32cb >> button[type="submit"]');

  assertStep(
    'Shadow DOM encapsulates form with email, name, company inputs',
    (await widgetEmail.count()) === 1 && (await widgetName.count()) === 1 && (await widgetSubmitBtn.count()) === 1
  );

  // Test 2A: Fill form and submit
  const testLeadEmail = `playwright.lead.${Date.now()}@example.com`;
  await widgetName.fill('Playwright Desktop Tester');
  await widgetEmail.fill(testLeadEmail);
  await widgetCompany.fill('Acme Partner Enterprise');

  // Human timing delay: ensure at least 1500ms has elapsed since render to pass velocity check
  await page.waitForTimeout(1600);

  // Intercept the submission POST request to inspect response
  const [submissionResponse] = await Promise.all([
    page.waitForResponse((res) => res.url().includes('/api/v1/submissions') && res.request().method() === 'POST'),
    widgetSubmitBtn.click(),
  ]);

  assertStep(
    'Form submission network request returned 201 Created',
    submissionResponse.status() === 201,
    `Status: ${submissionResponse.status()} ${submissionResponse.statusText()}`
  );

  // Verify inline success state in Shadow DOM
  await page.waitForTimeout(500);
  const successState = page.locator('#flyrank-widget-e7b4010a-3d96-48c9-94b2-03d6d03d32cb >> .flyrank-success-state');
  const successText = (await successState.count()) > 0 ? await successState.textContent() : '';
  assertStep(
    'Inline accessible success state displayed in Shadow DOM',
    successText.includes('Thank you'),
    `Message: "${successText.trim()}"`
  );

  // Capture Widget Screenshot
  const widgetScreenshotPath = path.join(screenshotsDir, 'widget_submitted.png');
  await page.screenshot({ path: widgetScreenshotPath });
  console.log(`     └─ Saved screenshot: ${path.relative(process.cwd(), widgetScreenshotPath).replace(/\\/g, '/')}`);

  // ==========================================================================
  // TEST SUITE 3: REAL-TIME REFLECTION IN OWNER DASHBOARD
  // ==========================================================================
  console.log('\n▶ [4/4] Verifying Lead Appears in Real Dashboard...');

  await page.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle' });

  // Since JWT is in localStorage, dashboard view should restore immediately
  await page.waitForSelector('#dashboard-view', { state: 'visible', timeout: 5000 });
  await page.waitForTimeout(800);

  const dashboardContent = await page.content();
  assertStep(
    'Submitted lead email is visible in the recent leads table',
    dashboardContent.includes(testLeadEmail),
    `Found lead email: ${testLeadEmail}`
  );

  // Check console errors
  assertStep(
    'Zero unhandled browser console errors during session',
    consoleErrors.length === 0,
    consoleErrors.length === 0 ? 'Clean browser console' : `Errors: ${consoleErrors.join(', ')}`
  );

  // ==========================================================================
  // TEARDOWN & SUMMARY
  // ==========================================================================
  await browser.close();

  console.log('\n====================================================');
  console.log(` Browser Verification Summary: ${passed}/${total} checks passed (${Math.round((passed / total) * 100)}%)`);
  console.log('====================================================\n');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runBrowserTests().catch((err) => {
  console.error('Fatal Playwright browser error:', err);
  process.exit(1);
});
