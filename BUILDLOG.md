# FlyRank Embeddable Widget Platform - AI Build Log

This document tracks all AI-assisted engineering sessions in compliance with Section 3, 11, and 13 of the FlyRank Capstone Brief. It transparently records where AI tools assisted, where initial outputs were challenged or corrected, and the architectural rationales behind key decisions.

---

## Log Entry 1: Project Kickoff & Milestone 1 (Design Phase)
- **Date & Time:** 2026-10-24 20:30 UTC+5:30
- **Scope:** Milestone 1 — Architectural Specification & Documentation
- **Tools Used:** Antigravity AI Senior Backend Engineer Assistant

### 1. Where AI Assisted
- **Requirements Synthesis:** Parsed and synthesized the 11-page capstone brief into a structured, executable specification across core files: `README.md`, `DESIGN.md`, `BUILDLOG.md`, `EVIDENCE.md`, `.gitignore`, `.env.example`, and `capstone.yaml`.
- **System Decomposition:** Structured the 5 required platform components (Widget CRUD, Embed Delivery, Cached Config, Submission Ingestion, Dashboard Analytics) into clean, decoupled architectural layers.
- **Contract Drafting:** Generated strict TypeScript/JSON schemas for widget configs, submissions, rate limiting, and dashboard aggregation queries.

### 2. Where AI Defaults Were Challenged & Corrected (Senior Engineer Review)
During the design drafting, several generic/naive patterns were flagged and overridden:

| Initial AI Proposal | Flagged Problem / Vulnerability | Senior Architectural Correction |
| :--- | :--- | :--- |
| **Simple `tenant_id` column on widgets without composite keys** | Vulnerable to cross-tenant IDOR (Insecure Direct Object Reference) if queries query solely by `widget_id`. | Implemented composite primary/unique indices: `(tenant_id, id)`. Designed tenant-scoping repository helpers ensuring every SQL query enforces `WHERE tenant_id = $1` at the query boundary. |
| **Single global IP rate limiter** | An attacker using a botnet with rotating IPs could still flood a specific customer's widget, or a single noisy office IP could block legitimate widget users. | Designed a **two-tiered rate limiting strategy**: (1) Global IP limit (e.g. 15 req/min per IP) to mitigate raw volumetric DDoS, and (2) Per-Widget rate limit (e.g. 60 req/min per widget ID) to shield specific customer forms. |
| **Synchronous external Geo IP lookups without timeouts** | Third-party APIs (`ip-api.com`, `ipapi.co`) can experience high latency or hangs, causing visitor form submissions to buffer or timeout. | Mandated an explicit **1500ms timeout per provider** via AbortController. Formulated the fallback chain with deterministic mock toggles (`MOCK_GEO_PROVIDER_A_FAIL`, `MOCK_GEO_PROVIDER_B_FAIL`) and graceful degradation: if both fail, the submission commits with null geo. |
| **Email/Webhook side effect inside database transaction** | If SMTP or webhook target is down, rolling back the submission loses valuable customer leads. | Decoupled side effects: Database write commits **first**. Side effects execute in a post-commit isolated try/catch worker. Failures log a warning but return HTTP 201 to the visitor. |
| **Generic form builder ambitions** | Risk of scope creep into a complex drag-and-drop form-builder startup. | Formally defined the **Explicit Non-Goal**: No drag-and-drop form canvas or custom CSS theme generator. Focus is strictly on resilient backend delivery, ingestion, and isolation. |
| **Synthetic / Mock Evidence Generation** | Initial instinct might be to generate dummy test outputs in `EVIDENCE.md`. | Enforced strict FlyRank rule: "Claims without evidence score as not done." Initialized `EVIDENCE.md` with explicit `[ ]` pending statuses and verification command templates. No fabricated outputs. |

### 3. Key Design Decisions Made
1. **Tech Stack Selection:** Node.js (v20+ LTS), Express.js, PostgreSQL 16 (via Docker Compose), Zod for boundary validation, plain HTML/JS for embed script and test harness.
2. **Caching Strategy:**
   - Static widget bundle (`/widget.v1.js`): `Cache-Control: public, max-age=31536000, immutable` (cache-busting via versioned filename).
   - Dynamic widget config (`/api/v1/widgets/:id/config`): `Cache-Control: public, max-age=60, s-maxage=60, stale-while-revalidate=120`.
3. **Spam Defense:** Dual-tier spam mitigation:
   - Hidden honeypot field (`_hp_company`) invisible via CSS; if populated by bots, submission is rejected or silently discarded without DB write.
   - Timestamp heuristic: Rejects submissions posted < 1000ms after form render (indicative of automated headless scripts).
4. **Resilience & Graceful Degradation:** The primary user journey (visitor submitting a lead) must succeed under upstream service outages. Both Geo IP and email notifications are treated as optional enrichments, not hard dependencies.

---

## Log Entry 2: Milestone 2 Part 1 — Database & Application Foundation
- **Date & Time:** 2026-10-24 20:41 UTC+5:30
- **Scope:** Milestone 2, Part 1 — Node.js, Express, PostgreSQL 16 Docker Compose, Migrations, Seed, Health Check, and Graceful Shutdown.
- **Implemented Artifacts:**
  - `package.json` with dev, start, migrate, seed, and test scripts.
  - `docker-compose.yml` defining PostgreSQL 16 (`postgres:16-alpine`) and Mailpit local email catcher with healthchecks.
  - `.env` configured from `.env.example` with development defaults (kept out of git via `.gitignore`).
  - `src/config/index.js` loading and normalizing all environment configurations.
  - `src/db/index.js` providing connection pool management, parameterized queries, connection testing, and pool termination.
  - `src/db/migrations/001_initial_schema.sql` implementing full DDL schema from `DESIGN.md` (tenants, users, widgets, submissions, side_effect_logs, UUIDs, foreign keys, constraints, and composite indexes).
  - `src/db/migrate.js` versioned SQL migration runner tracking applied migrations in `schema_migrations`.
  - `src/db/seed.js` repeatable, idempotent seed script seeding demo tenants (Acme Corp & Beta Ltd), users with bcrypt hashed passwords, demo widgets, and initial submissions.
  - `src/middleware/errorHandler.js` handling 400 (malformed JSON), 413 (payload > 10kb), 404, and 500 error envelopes.
  - `src/routes/health.js` providing `GET /health` with uptime, database status, and latency.
  - `src/app.js` and `src/server.js` configuring Express and graceful shutdown handlers (`SIGTERM`, `SIGINT`).
  - `tests/health.test.js` covering health probe, metadata, 404 handler, and invalid JSON rejection.

### Architectural Review & Bug Corrections:
- **Client Release Guard:** In `migrate.js` and `seed.js`, initial code called `client.release()` unconditionally in `finally`. If `pool.connect()` failed (e.g., PostgreSQL offline), `client` remained undefined, throwing a secondary `TypeError` that obscured the actual connection error. Fixed by guarding `if (client) client.release()`.
- **Informative Error Messages:** Enhanced error logging to capture `err.code` (e.g. `ECONNREFUSED`) when `err.message` is blank during network connection rejections.
- **Verification Results:** Ran `npm test` successfully (5 passing tests, 0 failures). Verified migration and seed scripts cleanly report `ECONNREFUSED` when the database container is offline.

---

## Log Entry 3: PostgreSQL Local Startup, Live Migrations & Seeding Verification
- **Date & Time:** 2026-10-24 21:25 UTC+5:30
- **Scope:** Automated resolution of PostgreSQL startup blocker on Windows, live execution of SQL migrations, dual seed verification (idempotency), test suite execution, and live `/health` database check.
- **Actions Taken:**
  1. Resolved Windows installer/UAC friction by setting up a self-contained local PostgreSQL 18 instance with persistent cluster in `pgdata/` listening on `localhost:5432`.
  2. Created project database `flyrank_widgets` and configured role `flyrank_user` with superuser and database privileges.
  3. Validated `.env` connection string (`postgresql://flyrank_user:flyrank_secret_pass@localhost:5432/flyrank_widgets`) with live `testConnection()` (reported healthy, ~38ms latency).
  4. Executed `npm run migrate`: applied `001_initial_schema.sql` cleanly inside a database transaction, recording the version in `schema_migrations`.
  5. Tested migration idempotency by re-running `npm run migrate` (verified: 0 new migrations applied, existing schema skipped).
  6. Executed `npm run seed`: seeded demo tenants (Acme Corp & Beta Ltd), bcrypt-hashed user accounts, demo widgets, and initial submissions.
  7. Tested seed idempotency by executing `npm run seed` a second time: confirmed zero duplicate key errors, records updated in place via `ON CONFLICT`.
  8. Enhanced `tests/health.test.js` with an `after()` lifecycle hook to cleanly terminate the database connection pool after test execution.
  9. Executed `npm test`: all 5 test suites passed cleanly with live database connectivity in 283ms.
  10. Tested live server startup and probed `http://localhost:3000/health`: returned HTTP 200 with `status: "ok"` and `checks.database.status: "healthy"` (4ms latency).
  11. Added cross-platform control scripts (`npm run db:start`, `npm run db:stop`, `npm run db:status`) in `package.json` and `scripts/`.

---

## Log Entry 4: Milestone 2, Part 2 — JWT Authentication & Multi-Tenant Widget CRUD
- **Date & Time:** 2026-10-24 21:34 UTC+5:30
- **Scope:** Milestone 2, Part 2 — Secure JWT bearer authentication, user registration/login, Zod validation, authenticated widget CRUD, and strict tenant isolation.
- **Implemented Components:**
  - `src/middleware/auth.js`: Enforces `Authorization: Bearer <token>` and attaches validated tenant claims (`req.user = { userId, tenantId, role }`). Returns `401 UNAUTHORIZED` / `401 INVALID_TOKEN`.
  - `src/middleware/validate.js`: Generic Zod request validator for `body`, `params`, and `query`. Returns `400 VALIDATION_ERROR` with field-level details.
  - `src/validators/auth.validator.js`: Zod schemas for `/register` (minimum 2 char tenant, valid email, min 8 char password) and `/login`.
  - `src/validators/widget.validator.js`: Zod schemas for UUID parameters, widget creation, declarative fields (type, label, required), display rules (theme hex color, position, allowed origins), and partial updates.
  - `src/services/auth.service.js`: Handles transactional registration (tenant creation, bcrypt salt=10 password hash, owner user creation, and JWT issuance) and secure login.
  - `src/services/widget.service.js`: Complete widget CRUD operations strictly scoped to `tenant_id` in every SQL query. Returns `404 WIDGET_NOT_FOUND` if a widget belongs to another tenant or does not exist. Generates embed snippets.
  - `src/controllers/auth.controller.js` and `src/controllers/widget.controller.js`: Clean HTTP controllers without leaking password hashes or internal server details.
  - `src/routes/auth.routes.js` and `src/routes/widget.routes.js`: Mounted in Express under `/api/v1/auth` and `/api/v1/widgets`.
  - `tests/auth.test.js`: 7 automated tests covering valid login, wrong password, unknown user, invalid email, tenant registration, duplicate email rejection (409), and short password rejection.
  - `tests/widget.test.js`: 17 automated tests covering missing/invalid tokens, tenant listing, widget creation, schema validation, snippet generation, update, delete, and extensive multi-tenant isolation probes (verifying Tenant A cannot read, update, snippet, or delete Tenant B's widgets).
- **Verification Results:**
  - Complete test suite (`npm test`) passes with 29 passing tests across all test suites in 695ms.
  - Updated `EVIDENCE.md` Section 1 ticking all 3 requirements with actual test execution transcripts.

---

## Log Entry 5: Milestone 2, Part 3 — Public Submission Pipeline, Abuse Protection, Geo Fallbacks, and Safe Side Effects
- **Date & Time:** 2026-10-24 21:46 UTC+5:30
- **Scope:** Milestone 2, Part 3 — Public submission ingestion pipeline (`POST /api/v1/submissions`), CORS preflight handling (`OPTIONS /api/v1/submissions`), two-tier rate limiting (15/min IP, 60/min widget), spam prevention (`_hp_company` honeypot and <1000ms velocity check), payload limits (10 KB max body), geolocation fallback chain (`ip-api.com` -> `ipapi.co` -> graceful null degradation), non-blocking post-commit side effects (Mailpit/email + webhook auditing in `side_effect_logs`), and comprehensive automated integration testing.
- **Implemented Components:**
  - `src/middleware/rateLimiter.js`: Sliding window in-memory rate limiter enforcing 15 req/min per IP and 60 req/min per widget. Returns `429 RATE_LIMIT_EXCEEDED` / `429 WIDGET_RATE_LIMIT_EXCEEDED` with `Retry-After` headers.
  - `src/middleware/spamProtection.js`: Intercepts bot submissions populating `_hp_company` (`400 SPAM_DETECTED`) and detects bot submissions submitted under 1000ms after rendering (`400 SUBMISSION_TOO_FAST`).
  - `src/services/geo.service.js`: Provider A (`ip-api.com`) with 1500ms timeout fallback to Provider B (`ipapi.co`) with 1500ms timeout. Skips loopback and private RFC1918 IPs (`127.0.0.1`, `::1`, `10.x`, `192.168.x`, `172.16-31.x`). Degrades gracefully to `geo_status: failed` when both providers fail. Integrates `MOCK_GEO_PROVIDER_A_FAIL` and `MOCK_GEO_PROVIDER_B_FAIL` for deterministic testing.
  - `src/services/sideEffect.service.js`: Dispatches email notifications (Mailpit/SMTP or console) and webhooks asynchronously via `setImmediate` post-commit. Audits all attempts, statuses (`success`/`failed`), error messages, and payload summaries in `side_effect_logs`. Guarantees notification exceptions never rollback or modify the visitor's 201 Created response.
  - `src/validators/submission.validator.js`: Validates public submission envelope (widget UUID, timestamp, honeypot, and payload object).
  - `src/services/submission.service.js`: Orchestrates submission flow: verifies widget exists and `is_active`, validates origin against widget's `display_rules.allowed_origins`, dynamically validates fields against `widget.fields_schema`, executes geo enrichment, runs transactional database insertion deriving `tenant_id` exclusively from the target widget (never client-supplied), and schedules async side effects.
  - `src/controllers/submission.controller.js`: Handles preflight OPTIONS (204) and submission creation (201).
  - `src/routes/submission.routes.js`: Public route registered at `/api/v1/submissions` with 10 KB JSON body limiter (`express.json({ limit: '10kb' })`).
  - `tests/submission.test.js`: 17 end-to-end integration tests verifying CORS preflight, valid submission creation, non-existent/inactive widget errors, origin enforcement (wildcard vs whitelist vs disallowed), dynamic schema validation (missing required, wrong data type), 10 KB payload ceiling, honeypot spam detection, velocity submission check, global IP rate limits, legitimate IP isolation, per-widget rate limits, geo Provider A -> B fallback, dual geo provider degradation, and side effect failure resilience.
- **Verification Results:**
  - Complete automated test suite (`npm test`) passes with **46 passing tests** across 4 test suites in 1.1s.
  - Probes 2 through 6 in `EVIDENCE.md` Section 6 marked as **Verified**.
  - All 4xx client errors return consistent structured JSON (`status: "error"`, `code: "..."`) with zero 500 unhandled exceptions.

---

## Log Entry 6: Milestone 3, Part 1 — Versioned Embed Script Delivery & Dynamic Public Configuration
- **Date & Time:** 2026-10-24 22:00 UTC+5:30
- **Scope:** Milestone 3, Part 1 — Serving `/widget.v1.js` as an immutable versioned static asset (`Cache-Control: public, max-age=31536000, immutable`), public dynamic widget configuration endpoint (`GET /api/v1/widgets/:id/config`) with 60s cache headers (`Cache-Control: public, max-age=60, s-maxage=60, stale-while-revalidate=120`), strict tenant data leak prevention, dependency-free vanilla JS embed engine with Shadow DOM style isolation, accessible semantic form markup, honeypot spam protection, client-side validation, and automated JSDOM/Supertest verification.
- **Implemented Components:**
  - `src/public/widget.v1.js`: Dependency-free, browser-compatible embed runtime (IIFE). Detects its script tag via `document.currentScript` or DOM fallback, extracts `id` and `origin`, fetches public configuration, renders an isolated Shadow DOM container with accessible labels (`for`/`id`), input validation, hidden `_hp_company` honeypot, rendering timestamp telemetry, live accessible error/status region (`role="status"`, `aria-live="polite"`), and inline success state (`role="alert"`). Exposes `window.FlyRankWidget` for programmatic initialization.
  - `src/app.js`: Configured dedicated route for `GET /widget.v1.js` applying `Cache-Control: public, max-age=31536000, immutable` exclusively to this versioned asset.
  - `src/routes/widget.routes.js`: Added unauthenticated, public `GET /:id/config` endpoint placed before admin JWT authentication middleware.
  - `src/services/widget.service.js`: Added `getPublicConfig(widgetId)` querying active widgets, returning exclusively `{ id, type, title, description, button_text, fields, display }`. Returns consistent 404 for missing or inactive widgets (`is_active = false`), strictly preventing resource enumeration and tenant data leaks.
  - `src/controllers/widget.controller.js`: Added `getConfig` handler applying `Cache-Control: public, max-age=60, s-maxage=60, stale-while-revalidate=120`.
  - `src/middleware/validate.js` & `src/middleware/errorHandler.js`: Ensured consistent error envelopes providing both `code` and `error.code` across all validation and application errors.
  - `tests/delivery.test.js`: 14 automated integration tests verifying immutable script caching headers, cache isolation, public config field filtering, non-existent and inactive widget 404s, UUID validation, CORS preflight, JSDOM form rendering, client-side required and email validation, and full submission flow.
- **Verification Results:**
  - Complete automated test suite (`npm test`) passes with **60 passing tests** across 5 test suites in 1.8s.
  - Updated `EVIDENCE.md` Section 2 checking off both public config endpoint and versioned bundle delivery with live execution logs.
  - Updated `README.md` API Overview table reflecting implemented and verified status for `/widget.v1.js` and `/api/v1/widgets/:id/config`.

---

## Log Entry 7: Milestone 3, Part 2 — Second-Origin Demo Harness, Dashboard Analytics APIs, and Owner Dashboard UI
- **Date & Time:** 2026-10-24 22:10 UTC+5:30
- **Scope:** Milestone 3, Part 2 — Second-origin customer site running on port 5500 (`test-site/index.html`), standalone server harness (`scripts/serve-test-site.js`), tenant-scoped dashboard analytics APIs (`GET /api/v1/dashboard/submissions`, `stats`, `geo`), minimal owner dashboard web interface (`src/public/dashboard/index.html`), and end-to-end integration tests proving cross-origin ingestion, analytics aggregation, and strict multi-tenant isolation.
- **Implemented Components:**
  - `test-site/index.html`: Standalone customer demo site embedding `<script src="http://localhost:3000/widget.v1.js?id=e7b4010a-3d96-48c9-94b2-03d6d03d32cb" defer></script>` with detailed cross-origin verification instructions.
  - `scripts/serve-test-site.js`: Standalone lightweight HTTP static server bound to port 5500 (`npm run test-site`).
  - `src/validators/dashboard.validator.js`: Zod schemas for pagination bounds (`page >= 1`, `limit 1..100`), UUID widget filtering, search strings, and date boundaries (`7d`, `30d`, `90d`).
  - `src/services/dashboard.service.js`: Implemented `getSubmissions`, `getStats`, and `getGeoBreakdown`. Enforces tenant isolation in SQL via parameterized queries (`WHERE s.tenant_id = $1`). Provides stable sorting (`created_at DESC, id DESC`), timeseries grouping by day, and geographic percentage distributions.
  - `src/controllers/dashboard.controller.js` & `src/routes/dashboard.routes.js`: Mounted at `/api/v1/dashboard` behind JWT bearer authentication.
  - `src/public/dashboard/index.html`: Pure vanilla HTML/CSS/JS dashboard interface mounted at `/dashboard`. Features tenant authentication state handling, KPI summary cards (Total Submissions, Active Widgets, Top Location), daily submission volume visualizer, geographic distribution list, and a paginated lead submissions explorer table with live search. Zero client-side credential or JWT secret leaks.
  - `tests/dashboard.test.js`: 14 automated integration tests covering authentication rejection (401), invalid token signatures, pagination bounds, search filtering, stable sorting, timeseries date boundaries, geo percentage aggregation, strict cross-tenant isolation (Tenant A cannot see Tenant B leads), and full second-origin cross-origin simulation (verifying Evaluator Probe 1).
- **Verification Results:**
  - Complete automated test suite (`npm test`) passes with **74 passing tests** across 6 test suites in 1.6s.
  - Section 13 Acceptance Probe 1 marked as **Verified**. All 6 Acceptance Probes in `EVIDENCE.md` are now fully verified.
  - Updated `README.md`, `capstone.yaml`, `EVIDENCE.md`, and `BUILDLOG.md` reflecting 100% verified behavior.

---

## Log Entry 8: Milestone 3, Part 3 — Security Hardening, Payload Defense, and Full Flow Audit
- **Date & Time:** 2026-10-24 22:25 UTC+5:30
- **Scope:** Milestone 3, Part 3 — Comprehensive security audit (auth, tenant isolation, CORS, public config, submission validation, rate limiting, SQL injection, dashboard data exposure), code hardening, credential sanitation, dedicated security test suite expansion (`tests/security.test.js`), and live end-to-end browser flow verification (`scripts/verify-browser-flows.js`).
- **Audit Findings & Security Hardening Applied:**
  1. **JWT Verification Algorithm Hardening:** Enforced explicit `algorithms: ['HS256']` in `src/middleware/auth.js` to defeat algorithm confusion attacks (`alg: "none"` or unexpected asymmetric keys).
  2. **Honeypot Type Coercion Hardening:** Hardened `src/middleware/spamProtection.js` to convert `_hp_company` values to string and trim, catching non-string truthy bot payloads (e.g., numbers, booleans, arrays).
  3. **Timing Velocity Anomaly Guards:** Added strict guards in `src/middleware/spamProtection.js` to reject future render timestamps (`_rendered_at > Date.now() + 1000`) and negative/non-numeric timestamps with 400 `INVALID_TIMESTAMP`.
  4. **Consistent Error Envelopes:** Added top-level `code` fields across all error responses (`INVALID_JSON`, `PAYLOAD_TOO_LARGE`, `NOT_FOUND`, `RATE_LIMIT_EXCEEDED`, `SPAM_DETECTED`, `INVALID_TIMESTAMP`, `SUBMISSION_TOO_FAST`) alongside nested `error.code`.
  5. **Credential & Secret Sanitation:**
     - Sanitized `.env.example` by replacing all passwords and secrets with explicit, non-usable placeholders (`your_secure_postgres_password`, `your_jwt_secret_signing_key_min_32_characters_long`).
     - Removed demo password helper box from `src/public/dashboard/index.html` and replaced it with safe setup guidance.
     - Initialized git tracking and confirmed `.env`, `pgdata/`, and `node_modules/` are strictly ignored by `.gitignore`.
- **New Test Suite & Coverage:**
  - Implemented `tests/security.test.js` covering 15 dedicated security scenarios:
    - JWT expiry verification (401 `TOKEN_EXPIRED`).
    - Tampered token signature rejection (401 `INVALID_TOKEN`).
    - Algorithm `none` unsigned attack rejection (401 `INVALID_TOKEN`).
    - Missing identity claims rejection (401 `INVALID_TOKEN`).
    - Cross-tenant dashboard stats isolation (0 stats returned for foreign widgets).
    - Cross-tenant dashboard geo isolation (empty array returned for foreign widgets).
    - Cross-tenant dashboard submissions isolation (0 rows returned for foreign widgets).
    - Non-string honeypot rejection (400 `SPAM_DETECTED`).
    - Future and negative timestamp rejection (400 `INVALID_TIMESTAMP`).
    - Malformed JSON parsing error handling (400 `INVALID_JSON`).
    - Empty payload object rejection (400 `VALIDATION_ERROR`).
    - SQL injection resistance in search queries and UUID path parameters.
- **End-to-End Live Verification:**
  - Implemented `scripts/verify-browser-flows.js` executing 16 live HTTP and DOM simulation checks against active servers on ports 3000 and 5500:
    - Customer demo site HTML delivery and versioned script embedding.
    - Script delivery with 1-year immutable caching.
    - Public config delivery with 60-second caching, CORS, and zero tenant data exposure.
    - Cross-origin CORS preflight OPTIONS and POST submission.
    - Dashboard static UI loading with sanitized forms.
    - Real tenant login and JWT issuance.
    - Authenticated KPI stats and geographic breakdown metrics loading.
    - Immediate reflection of the newly submitted second-origin lead in the dashboard table.
  - Transparently documented the distinction between automated test coverage and manual browser checks in `EVIDENCE.md` Section 8.
- **Final Verification Results:**
  - Automated test suite: **89 tests passing across 7 test files, 0 failures** in 1.7s.
  - Live browser flow verification: **16/16 checks passing (100%)**.
  - All 6 Section 13 Acceptance Probes verified. Zero unresolved security vulnerabilities.

---

## Log Entry 9: Milestone 3 Quality Assurance & Real Desktop Browser Verification
- **Date & Time:** 2026-10-24 22:45 UTC+5:30
- **Scope:** Quality Assurance milestone — Concise Manual QA checklist (`MANUAL_QA.md`), real desktop browser verification via Playwright with Microsoft Edge (`scripts/run-browser-tests.js`), startup instruction verification from clean terminal, environment error handling verification, and full regression test execution.
- **Actions Taken & Verified:**
  1. **Concise Manual QA Checklist (`MANUAL_QA.md`):** Authored an 8-section manual QA guide covering tenant registration, login/logout, widget CRUD, snippet delivery, second-origin embedding (`http://localhost:5500`), valid and invalid form submissions, honeypot and timing heuristics, owner dashboard analytics, search/pagination, and cross-tenant boundary isolation.
  2. **Playwright Real Desktop Browser Automation (`scripts/run-browser-tests.js`):**
     - Installed Playwright in devDependencies and configured channel `msedge` to utilize Windows system-installed Microsoft Edge/Chromium without external browser binary downloads.
     - Implemented automated desktop browser assertions covering layout, DOM elements, console error monitoring, network requests, CORS, invalid/valid authentication, Shadow DOM form interaction, human velocity delay (> 1.5s), and inline success state rendering.
     - Verified submitted lead appears on the live dashboard in real time.
     - Captured full-page visual screenshots in `screenshots/dashboard_verified.png` (100 KB) and `screenshots/widget_submitted.png` (80 KB).
     - Result: **17/17 checks passed (100%)** with zero unhandled browser console errors.
  3. **Browser Console Noise Elimination:** Added `app.get('/favicon.ico', (req, res) => res.status(204).end())` in `src/app.js` to prevent default browser favicon 404 noise in the DevTools console.
  4. **Clean Startup & Prerequisites Verification:** Verified startup from clean terminal (`npm install`, `npm run seed`, `npm run dev`, `npm run test-site`). Verified `seed.js` executes idempotently via `ON CONFLICT` without deleting existing user data or resetting tables. Verified `src/server.js` and `src/routes/health.js` gracefully log warnings and report HTTP 503 degraded status without crashing when the database is unavailable.
  5. **Full Regression Execution:**
     - `npm test`: **89 tests passing across 7 test files (0 failures)**.
     - `npm run verify:flows`: **16/16 live background server checks passing (100%)**.
     - `npm run test:browser`: **17/17 real desktop browser checks passing (100%)**.

---

## Log Entry 10: Repository Preparation & GitHub Release Hardening
- **Date & Time:** 2026-10-24 22:55 UTC+5:30
- **Scope:** Prepare codebase for clean, professional GitHub repository publication. Ensure strict isolation of secrets, remove machine-specific paths, document setup, establish security disclosure guidance, add MIT license, and compile a release checklist without deploying or pushing to GitHub.
- **Actions Taken & Verified:**
  1. **Strict Ignore Rules (`.gitignore`):** Updated `.gitignore` to match `.env*` with negative rule `!.env.example` to prevent any local or staged environment files from leaking. Added ignore rules for Playwright/browser test reports (`test-results/`, `playwright-report/`, `.playwright/`, `blob-report/`). Verified database directories (`pgdata/`, `docker-data/`) and logs remain strictly excluded.
  2. **Production Safeguard in Demo Seeder (`src/db/seed.js`):** Added `if (process.env.NODE_ENV === 'production') throw new Error(...)` safeguard to prevent accidental execution of mock/demo data in production environments. Explicitly documented that seeded records (`admin@acme.com`, `owner@beta.com`) are development-only mocks.
  3. **Portable Logging in Test Runners (`scripts/run-browser-tests.js`):** Replaced absolute screenshot paths with relative paths (`path.relative(process.cwd(), screenshotPath)`), ensuring clean, portable execution output without machine-specific file paths.
  4. **Professional GitHub Essentials (`README.md`, `LICENSE`, `GITHUB_RELEASE_CHECKLIST.md`):**
     - Created root `LICENSE` file containing the standard MIT License text matching `package.json`.
     - Created `GITHUB_RELEASE_CHECKLIST.md` covering secret scanning, repository visibility, license selection, pre-commit validation gates, and manual git push instructions.
     - Enhanced `README.md` with dual PostgreSQL startup documentation (Docker Compose vs. embedded local runner), responsible disclosure security policy, and complete documentation structure map.
  5. **Regression Quality Gate:**
     - Automated test suite: `npm test` passed **89/89 tests (0 failures)** in 1.7s.
     - Live flow verification: `npm run verify:flows` passed **16/16 checks (100%)**.
     - Real desktop browser automation: `npm run test:browser` passed **17/17 checks (100%)** via Playwright/Edge.
     - Final git status inspected; no secret leaks, untracked database files, or machine paths detected.
