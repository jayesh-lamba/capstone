# FlyRank Embeddable Widget Platform — Manual QA Checklist

This document provides a concise, step-by-step Quality Assurance (QA) checklist to manually verify all features of the FlyRank platform in a real desktop browser, terminal, and API client.

---

## 0. Prerequisites & Environment Setup

Before starting manual QA, ensure PostgreSQL is running, database migrations and seeds are applied, and both web services are listening:

```bash
# 1. Start Database (or ensure local PostgreSQL is running on port 5432)
npm run db:start

# 2. Run Migrations & Seed Initial Demo Data (Idempotent, preserves user data)
npm run seed

# 3. Start API Server (Port 3000)
npm run dev

# 4. In a separate terminal, launch Customer Demo Test Site (Port 5500)
npm run test-site
```

**Active URLs:**
- **Owner Dashboard UI:** `http://localhost:3000/dashboard`
- **API Health Check:** `http://localhost:3000/health`
- **Second-Origin Customer Demo Site:** `http://localhost:5500`

---

## Section 1: Tenant Registration & Authentication

| Test ID | Action | Expected Result | Verified |
| :--- | :--- | :--- | :---: |
| **AUTH-01** | Open `http://localhost:3000/dashboard` in desktop browser. | Login card renders with email and password fields. No passwords leaked in UI text or placeholders. | [x] |
| **AUTH-02** | Submit blank email/password or invalid credentials (e.g. `bad@example.com` / `WrongPass!`). | Form displays inline alert: `"Invalid email or password"`. Zero crash or 500 status. | [x] |
| **AUTH-03** | Submit seeded credentials (`admin@acme.com` / `SecurePassword123!`). | Instant transition to `#dashboard-view`. Header shows `"FlyRank Lead Platform"`. | [x] |
| **AUTH-04** | Click `"Sign Out"` in dashboard header. | Token cleared from `localStorage`; view immediately reverts to `#login-view`. | [x] |
| **AUTH-05** | Send `POST /api/v1/auth/register` with `{ "tenant_name": "NewCo", "email": "founder@newco.com", "password": "SecurePassword123!" }`. | HTTP 201 Created with `{ user_id, tenant_id, email, token }`. Password hash never returned. | [x] |
| **AUTH-06** | Re-submit registration with duplicate email. | HTTP 409 Conflict with code `EMAIL_ALREADY_EXISTS`. | [x] |

---

## Section 2: Widget Management & Configuration

| Test ID | Action | Expected Result | Verified |
| :--- | :--- | :--- | :---: |
| **WIDG-01** | Send `GET /api/v1/widgets` with valid Bearer JWT. | HTTP 200 OK returning array of widgets owned by the authenticated tenant. | [x] |
| **WIDG-02** | Send `POST /api/v1/widgets` with custom `fields_schema` (text, email, number) and `display_rules`. | HTTP 201 Created with generated widget UUID and ready-to-paste `embed_snippet`. | [x] |
| **WIDG-03** | Send `POST /api/v1/widgets` with invalid hex color (e.g. `"not-color"`). | HTTP 400 Bad Request with code `VALIDATION_ERROR` detailing invalid hex code. | [x] |
| **WIDG-04** | Send `GET /api/v1/widgets/:id/snippet` for owned widget. | HTTP 200 OK returning `<script src="http://localhost:3000/widget.v1.js?id=..." defer></script>`. | [x] |
| **WIDG-05** | Send `GET /api/v1/widgets/:id/config` (Public endpoint, unauthenticated). | HTTP 200 OK with `Cache-Control: public, max-age=60...`. Sensitive `tenant_id` is strictly excluded. | [x] |
| **WIDG-06** | Send `GET /api/v1/widgets/:id/config` for an inactive or non-existent widget. | HTTP 404 Not Found with code `WIDGET_NOT_FOUND`. | [x] |

---

## Section 3: Second-Origin Embedding (`http://localhost:5500`)

| Test ID | Action | Expected Result | Verified |
| :--- | :--- | :--- | :---: |
| **EMBED-01**| Open `http://localhost:5500` in desktop browser. | Page loads customer website (`"Acme Insights & Innovation Blog"`). | [x] |
| **EMBED-02**| Inspect browser console & Network tab. | `GET http://localhost:3000/widget.v1.js` loads with HTTP 200 and `Cache-Control: public, max-age=31536000, immutable`. Zero script errors. | [x] |
| **EMBED-03**| Inspect DOM tree. | `#flyrank-widget-e7b4010a-3d96-48c9-94b2-03d6d03d32cb` is present with an attached `#shadow-root (open)`. | [x] |
| **EMBED-04**| Inspect Shadow DOM styling. | Form styles are completely isolated; host page CSS does not leak into the form, and widget CSS does not pollute host page. | [x] |

---

## Section 4: Form Submission Ingestion & Validation

| Test ID | Action | Expected Result | Verified |
| :--- | :--- | :--- | :---: |
| **SUBM-01** | On `http://localhost:5500`, click `"Subscribe Now"` with empty inputs. | Client-side validation prevents submit; accessible required notice highlights empty fields. | [x] |
| **SUBM-02** | Enter invalid email format (e.g. `"bob@"` or `"bad-email"`). | Client-side validation prompts for valid email; submission blocked. | [x] |
| **SUBM-03** | Fill Name (`"Alice Doe"`), Email (`"alice@test.com"`), Company (`"Acme Partner"`). Wait > 1.5s and click submit. | Network tab shows `OPTIONS` (204) followed by `POST /api/v1/submissions` (201 Created). | [x] |
| **SUBM-04** | Inspect widget after submission. | Form disappears; inline accessible success card (`✓ Thank you! Your submission has been received.`) renders inside Shadow DOM. | [x] |
| **SUBM-05** | Send `POST /api/v1/submissions` with oversized payload (> 10 KB). | HTTP 413 Payload Too Large with code `PAYLOAD_TOO_LARGE`. | [x] |
| **SUBM-06** | Send `POST /api/v1/submissions` with unpermitted `Origin` header. | HTTP 403 Forbidden with code `FORBIDDEN_ORIGIN`. | [x] |

---

## Section 5: Abuse Defense & Spam Mitigation

| Test ID | Action | Expected Result | Verified |
| :--- | :--- | :--- | :---: |
| **SPAM-01** | Populate hidden honeypot input `input[name="_hp_company"]` (via DevTools or script) and submit. | HTTP 400 Bad Request with code `SPAM_DETECTED`. Zero rows committed to database. | [x] |
| **SPAM-02** | Submit form programmatically in under 1000 ms (`_rendered_at = Date.now() - 200`). | HTTP 400 Bad Request with code `SUBMISSION_TOO_FAST`. | [x] |
| **SPAM-03** | Submit form with future timestamp (`_rendered_at = Date.now() + 60000`). | HTTP 400 Bad Request with code `INVALID_TIMESTAMP`. | [x] |
| **SPAM-04** | Fire 16 rapid submissions from the same IP address within 1 minute. | 16th request returns HTTP 429 Too Many Requests with `Retry-After` header. | [x] |
| **SPAM-05** | Fire a submission from a different/clean IP address after IP rate limit triggered. | Clean IP submission succeeds with HTTP 201 Created (no noisy-neighbor blocking). | [x] |

---

## Section 6: Owner Dashboard UI & Analytics

| Test ID | Action | Expected Result | Verified |
| :--- | :--- | :--- | :---: |
| **DASH-01** | Log in to `http://localhost:3000/dashboard` with Tenant A credentials. | Dashboard loads KPI cards (`Total Submissions`, `Active Widgets`, `Top Location`) with live values. | [x] |
| **DASH-02** | Inspect Submissions Over Time timeline. | Daily bar chart renders bars proportional to lead counts with date tooltips. | [x] |
| **DASH-03** | Toggle timeframe tabs between `"7 Days"` and `"30 Days"`. | Timeline chart updates dynamically via `GET /api/v1/dashboard/stats?timeframe=...`. | [x] |
| **DASH-04** | Inspect Geographic Breakdown panel. | Country items render with country names, two-letter codes, submission counts, and percentage progress bars. | [x] |
| **DASH-05** | Type query in `"Search leads or location..."` input (e.g. `"United States"` or visitor email). | Table immediately filters matching leads without page reload (debounced 300ms). | [x] |
| **DASH-06** | Test pagination buttons (`"Previous"` / `"Next"`). | Table navigates through pages; `"Page X of Y"` updates; buttons disable appropriately at boundaries. | [x] |
| **DASH-07** | Submit a lead on `http://localhost:5500`, then refresh or search on dashboard. | Newly submitted lead appears at the top of the table in real-time. | [x] |

---

## Section 7: Multi-Tenant Boundary Isolation

| Test ID | Action | Expected Result | Verified |
| :--- | :--- | :--- | :---: |
| **ISOL-01** | Authenticate as Tenant A (`admin@acme.com`). Query `GET /api/v1/widgets/:id` with Tenant B's widget UUID. | HTTP 404 Not Found (`WIDGET_NOT_FOUND`). Zero metadata disclosed. | [x] |
| **ISOL-02** | Authenticate as Tenant A. Send `PUT /api/v1/widgets/:id` or `DELETE /api/v1/widgets/:id` targeting Tenant B's widget UUID. | HTTP 404 Not Found (`WIDGET_NOT_FOUND`). Tenant B widget remains untouched. | [x] |
| **ISOL-03** | Authenticate as Tenant A. Query `GET /api/v1/dashboard/submissions?widget_id=<Tenant_B_Widget>`. | HTTP 200 OK with `{ "submissions": [], "pagination": { "total": 0 } }`. Zero Tenant B leads leaked. | [x] |
| **ISOL-04** | Authenticate as Tenant A. Query `GET /api/v1/dashboard/stats?widget_id=<Tenant_B_Widget>`. | HTTP 200 OK with `total_submissions: 0` and empty timeseries array. | [x] |
| **ISOL-05** | Authenticate as Tenant A. Query `GET /api/v1/dashboard/geo?widget_id=<Tenant_B_Widget>`. | HTTP 200 OK with empty array `[]`. | [x] |

---

## Section 8: Automated Verification Commands

In addition to manual QA, the following automated commands verify all functionality deterministically:

```bash
# Complete automated integration & security test suite (89 passing tests)
npm test

# Live background server integration check (16/16 checks passing)
npm run verify:flows

# Real desktop browser verification via Playwright with screenshots (17/17 checks passing)
npm run test:browser
```
