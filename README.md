# FlyRank Embeddable Widget & Lead-Capture Platform

[![Node.js](https://img.shields.io/badge/Node.js-v20%2B-green.svg)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue.svg)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED.svg)](https://www.docker.com/)
[![License](https://img.shields.io/badge/License-MIT-purple.svg)](LICENSE)
[![Zero-Dollar-Stack](https://img.shields.io/badge/%240%20Stack-Free%20Tier%20Only-brightgreen.svg)](#)

> A resilient, multi-tenant backend platform for creating embeddable widgets (contact forms, newsletter signups, CTA popovers) delivered with a single line of `<script>`, backed by a hardened public ingestion pipeline featuring CORS preflight handling, boundary schema validation, multi-tiered rate limiting, honeypot spam protection, deterministic geo-provider fallback chains, and isolated side effects.

---

## 1. System Architecture Diagram

```text
                                 PUBLIC INTERNET (UNTRUSTED)
                                              │
                    ┌─────────────────────────┴─────────────────────────┐
                    │                                                   │
         (1) Cached Asset Request                              (2) Form Submission
        GET /widget.v1.js?id=...                            POST /api/v1/submissions
                    │                                                   │
                    ▼                                                   ▼
       ┌─────────────────────────┐                         ┌─────────────────────────┐
       │   Public Delivery &     │                         │  CORS & Preflight Guard │
       │     Cache Engine        │                         │  OPTIONS /submissions   │
       │  (max-age=31536000)     │                         └────────────┬────────────┘
       └────────────┬────────────┘                                      │
                    │                                                   ▼
                    │                                      ┌─────────────────────────┐
                    │                                      │  Payload Ceiling Guard  │
                    │                                      │   (Max 10kb JSON limit) │
                    │                                      └────────────┬────────────┘
                    │                                                   │
                    │                                                   ▼
                    │                                      ┌─────────────────────────┐
                    │                                      │  Two-Tier Rate Limiter  │
                    │                                      │   (IP + Widget ID)      │
                    │                                      └────────────┬────────────┘
                    │                                                   │
                    │                                                   ▼
                    │                                      ┌─────────────────────────┐
                    │                                      │  Zod Boundary Validator │
                    │                                      │ (Clean 4xx, never 500)  │
                    │                                      └────────────┬────────────┘
                    │                                                   │
                    │                                                   ▼
                    │                                      ┌─────────────────────────┐
                    │                                      │ Honeypot & Bot Heuristic│
                    │                                      │  (_hp_company / timing) │
                    │                                      └────────────┬────────────┘
                    │                                                   │
                    │                                                   ▼
                    │                                      ┌─────────────────────────┐
                    │                                      │ Geo Fallback Chain      │
                    │                                      │ Prov A -> Prov B -> Null│
                    │                                      └────────────┬────────────┘
                    │                                                   │
                    ▼                                                   ▼
       ┌─────────────────────────────────────────────────────────────────────────────┐
       │                              POSTGRESQL 16                                  │
       │                   Tenant-Isolated Storage Engine (Docker)                   │
       │     - widgets (tenant_id, fields_schema, display_rules)                     │
       │     - submissions (tenant_id, widget_id, payload, geo_data)                 │
       │     - side_effect_logs (submission_id, status, error)                       │
       └──────────────────────────────────────┬──────────────────────────────────────┘
                                              │
                         ┌────────────────────┴───────────────────┐
                         ▼                                        ▼
             ┌────────────────────────┐              ┌────────────────────────┐
             │ Isolated Side Effects  │              │  Owner Dashboard API   │
             │ - Mailpit Email        │              │  - Submissions list    │
             │ - Outbound Webhooks    │              │  - Timeseries counts   │
             │ (Failures never break) │              │  - Geo aggregations    │
             └────────────────────────┘              └────────────────────────┘
```

---

## 2. Key Capabilities & Technical Highlights

- **Multi-Tenant Isolation:** Guaranteed tenant boundary enforcement across all queries via composite indexing (`tenant_id, id`) and scoped repository helpers. Tenant A can never read or mutate Tenant B's assets.
- **Single-Line Embed Delivery:** Easily embedded into any external webpage:
  ```html
  <script src="http://localhost:3000/widget.v1.js?id=e7b4010a-3d96-48c9-94b2-03d6d03d32cb" defer></script>
  ```
- **Optimized Caching Headers:**
  - Script Bundle (`/widget.v1.js`): `Cache-Control: public, max-age=31536000, immutable`
  - Dynamic Config (`/api/v1/widgets/:id/config`): `Cache-Control: public, max-age=60, s-maxage=60, stale-while-revalidate=120`
- **Boundary Validation & Payload Protection:** Strict 10KB body limit and Zod schema validation ensuring bad input returns standard `4xx` JSON errors and never crashes the runtime (`500`).
- **Two-Tier Rate Limiting:** Global IP rate limiting (15 req/min) plus per-widget rate limiting (60 req/min) returning `429 Too Many Requests`.
- **Spam Mitigation:** Invisible honeypot field (`_hp_company`) paired with render-to-submit timing heuristics to intercept automated bots silently or with `400 Bad Request`.
- **Resilient Geolocation Fallback Chain:** Enriches visitor IP addresses using Provider A (`ip-api.com`), falling back to Provider B (`ipapi.co`). If both providers fail or timeout (1500ms limit), the submission commits with `null` geo data—**degrade, never fail**.
- **Non-Blocking Safe Side Effects:** Secondary notifications (email via Mailpit, outbound webhooks) run in isolated post-commit workers. Upstream failure in a secondary channel never impacts the primary `201 Created` client response.
- **Owner Dashboard Analytics:** Fast aggregation queries for timeseries submission counts and geographic distribution.

---

## 3. The $0 Free-Tools Stack

Every component runs entirely locally using free, zero-cost developer tooling with no credit card required:

| Role | Technology / Tool | Port / Notes |
| :--- | :--- | :--- |
| **Backend Runtime** | Node.js (v20+ LTS) + Express.js | Port `3000` |
| **Relational Database** | PostgreSQL 16 via Docker | Port `5432` |
| **Embed Test Harness** | Plain HTML/JS (`npx serve` / Python HTTP) | Port `5500` (Simulates second origin) |
| **Geo Provider A** | `ip-api.com` (JSON Endpoint) | Free public tier, 45 req/min, no API key |
| **Geo Provider B (Fallback)** | `ipapi.co` | Free public tier (~1,000 lookups/day), no card |
| **Email Side Effect** | Local Mailpit mail catcher or console logger | Port `1025` (SMTP) / `8025` (Web UI) |
| **Automated Testing** | Node Test Runner / Jest + Supertest | Continuous local execution |

---

## 4. Setup & Running the Platform

### Prerequisites
- Node.js v20.x or higher
- Docker and Docker Compose
- Git

### 4.1 Clone and Configure Environment
```bash
# 1. Clone repository
git clone https://github.com/flyrank/flyrank-capstone-widget-platform.git
cd flyrank-capstone-widget-platform

# 2. Copy environment variables
cp .env.example .env
```

### 4.2 Start Database & Run Migrations

You can run PostgreSQL via Docker or using the local database runner:

**Option A: Using Docker Compose (Recommended for containerized environments)**
```bash
docker compose up -d
```

**Option B: Using Embedded / Local PostgreSQL runner**
```bash
# Starts local PostgreSQL daemon in background (creates/uses ./pgdata)
npm run db:start

# To check status or stop later:
npm run db:status
npm run db:stop
```

Once PostgreSQL is running, initialize and seed the database:
```bash
# Run database migrations (creates tenants, users, widgets, submissions tables)
npm run migrate

# Seed default tenants, demo widgets, and sample analytics
# (Note: guarded to run only in development environments)
npm run seed

# Start API server in development mode
npm run dev
```
The API is now running at `http://localhost:3000`.

### 4.3 Launch Second-Origin Test Page
To simulate a real-world third-party website embedding the widget:
```bash
# In a separate terminal session, launch the customer test site on port 5500
npm run test-site
```
Visit `http://localhost:5500` in your browser to interact with the live embedded widget.

### 4.4 Launch Minimal Owner Dashboard UI
Visit `http://localhost:3000/dashboard` to log in as a widget owner, review KPI cards, explore submissions over time, and inspect lead conversion metrics. Safe credentials for testing can be seeded via `npm run seed`.

### 4.5 Run Automated Test Suite
To execute the comprehensive automated integration and security test suite:
```bash
# Runs 89 automated tests covering auth, tenant isolation, rate limiting, geo fallback, delivery, and security
npm test
```

### 4.6 Run Live End-to-End Flow Verification
To verify the full live browser ingestion and dashboard data-loading handshake against active servers:
```bash
# Verifies second-origin embed (port 5500) and dashboard auth & data queries (port 3000)
npm run verify:flows
```

### 4.7 Run Real Desktop Browser Verification with Playwright
To launch a real Microsoft Edge/Chromium desktop browser, interact with the DOM, test Shadow DOM form inputs, and capture screenshots:
```bash
# Runs 17 real desktop browser assertions and writes screenshots to screenshots/
npm run test:browser
```

### 4.8 Manual QA Checklist
A concise manual QA checklist for step-by-step browser and terminal verification is documented in [MANUAL_QA.md](MANUAL_QA.md).

---

## 5. API Documentation Overview

| Method | Endpoint | Access | Purpose | Status |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/health` | Public | System liveness probe | **Implemented & Verified** |
| `POST` | `/api/v1/auth/register` | Public | Register new tenant and account | **Implemented & Verified** |
| `POST` | `/api/v1/auth/login` | Public | Authenticate and obtain JWT | **Implemented & Verified** |
| `GET` | `/api/v1/widgets` | Authenticated | List all widgets owned by tenant | **Implemented & Verified** |
| `POST` | `/api/v1/widgets` | Authenticated | Create a new tenant-isolated widget | **Implemented & Verified** |
| `GET` | `/api/v1/widgets/:id` | Authenticated | Retrieve widget details | **Implemented & Verified** |
| `PUT` | `/api/v1/widgets/:id` | Authenticated | Update widget fields, title, or display rules | **Implemented & Verified** |
| `DELETE` | `/api/v1/widgets/:id` | Authenticated | Soft or hard delete widget | **Implemented & Verified** |
| `GET` | `/api/v1/widgets/:id/snippet` | Authenticated | Generate ready-to-paste embed `<script>` tag | **Implemented & Verified** |
| `GET` | `/widget.v1.js` | Public (Cached) | Fetch static embed JS bundle (1yr cache) | **Implemented & Verified** |
| `GET` | `/api/v1/widgets/:id/config` | Public (Cached) | Fetch dynamic widget configuration (60s cache) | **Implemented & Verified** |
| `OPTIONS`| `/api/v1/submissions` | Public (CORS) | CORS preflight handling | **Implemented & Verified** |
| `POST` | `/api/v1/submissions` | Public (CORS) | Ingest lead submission with spam and geo validation | **Implemented & Verified** |
| `GET` | `/api/v1/dashboard/submissions`| Authenticated | Paginated submissions with search & filters | **Implemented & Verified** |
| `GET` | `/api/v1/dashboard/stats` | Authenticated | Aggregated submission volume over time | **Implemented & Verified** |
| `GET` | `/api/v1/dashboard/geo` | Authenticated | Geographic country breakdown metrics | **Implemented & Verified** |
| `GET` | `/dashboard` | Public / UI | Minimal tenant owner dashboard web interface | **Implemented & Verified** |

Full JSON request/response schema specifications are documented in [DESIGN.md](DESIGN.md).

---

## 6. Honest Limitations & Architectural Trade-offs

In accordance with Section 11 of the capstone brief, here are the real-world limitations and deliberate trade-offs of this system:

1. **No Drag-and-Drop Visual Canvas (Explicit Non-Goal):** Widget configurations (fields, titles, buttons, theme colors) are defined purely via JSON payload schemas. While a visual builder is convenient for non-technical users, our architecture prioritizes robust public API resilience, tenant isolation, and boundary security.
2. **In-Memory Rate Limiting in Single-Instance Mode:** The default rate limiter uses an in-memory sliding window. While ideal for $0 development and single-container deployments, scaling horizontally across multiple Node.js instances in production would require backed storage (e.g. Redis) to share rate limit state across nodes.
3. **Free Geolocation Rate Limits:** Free external tiers (`ip-api.com` @ 45 req/min, `ipapi.co` @ 1,000 req/day) can be exhausted under extreme synthetic load testing. Our deterministic mock toggles (`MOCK_GEO_PROVIDER_A_FAIL`, `MOCK_GEO_PROVIDER_B_FAIL`) allow reproducible evaluation of the fallback chain and graceful degradation without hitting upstream rate limits.
4. **Local Mailpit Delivery:** Confirmation emails are routed to a local Mailpit SMTP server or logged to console rather than real transactional email services (e.g., SendGrid/SES) to keep the stack 100% free with no credit card requirement.

---

## 7. Repository Structure & Documentation Pack

- [`README.md`](README.md) — System architecture, setup instructions, API summary, and limitations (this file).
- [`DESIGN.md`](DESIGN.md) — Comprehensive database schema, tenant isolation model, API contracts, security architecture, and phased implementation plans.
- [`BUILDLOG.md`](BUILDLOG.md) — Senior engineering decisions, prompt history, architectural pivots, and verification steps.
- [`EVIDENCE.md`](EVIDENCE.md) — Functional requirements checklist and acceptance probe verification logs.
- [`MANUAL_QA.md`](MANUAL_QA.md) — Step-by-step manual testing instructions for browser and terminal verification.
- [`GITHUB_RELEASE_CHECKLIST.md`](GITHUB_RELEASE_CHECKLIST.md) — Pre-release checklist covering secret scanning, repository visibility, license selection, and git push instructions.
- [`capstone.yaml`](capstone.yaml) — Capstone evaluation manifest and metadata.
- [`.env.example`](.env.example) — Clean environment template with generic placeholders.
- [`.gitignore`](.gitignore) — Strict ignore rules for environments, build outputs, database directories, and test artifacts.
- [`LICENSE`](LICENSE) — MIT License terms.

---

## 8. Security & Responsible Disclosure

Security is a core design principle of FlyRank. Protections implemented include:
- Multi-tenant query isolation enforced at the database level with composite indexing.
- Strict 10 KB payload ceilings and strict Zod boundary schemas preventing memory exhaustion or injection.
- Two-tiered rate limiting (per-IP and per-widget).
- Dual honeypot mechanisms (`_hp_company` field and render-to-submission velocity heuristics).
- Sandboxed Shadow DOM widget rendering to prevent CSS/JS pollution on customer host pages.
- Fallback degradation for external network dependencies (geolocation, notifications).

### Reporting a Vulnerability
If you discover a security vulnerability within this project, please follow responsible disclosure guidelines:
- **Do not open a public GitHub issue** describing the vulnerability.
- Please report vulnerabilities privately by emailing the maintainer team or creating a private GitHub Security Advisory once published.
- Provide a clear explanation of the issue, affected endpoints, and steps or a proof-of-concept script to reproduce.
- Security reports will be acknowledged within 48 hours, and fixes prioritized before public release.

---

## 9. License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for full details.

