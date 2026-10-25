# GitHub Release & Repository Preparation Checklist

This checklist guides the secure, clean publication of the **FlyRank Embeddable Widget & Lead-Capture Platform** repository to GitHub. Follow each phase step-by-step before publishing or making the repository public.

---

## 1. Secret Scanning & Sensitive File Audit

Before staging or committing any files, ensure that no secrets, credentials, machine-specific paths, or internal logs are tracked or exposed.

- [ ] **Verify `.env` is Untracked & Ignored:**
  - Run `git status --ignored` to confirm `.env`, `.env.local`, `.env.*` appear under ignored items.
  - Confirm `.env.example` is the only tracked environment template and contains **only** generic placeholders (`your_secure_postgres_password`, `your_jwt_secret_signing_key_min_32_characters_long`).
- [ ] **Scan for Hardcoded Credentials & API Keys:**
  - Verify no private keys (`*.pem`, `*.key`), database passwords, or third-party tokens are hardcoded.
  - Run a local secret scan (e.g., using [gitleaks](https://github.com/gitleaks/gitleaks) or ripgrep):
    ```bash
    # Check for accidental password or secret strings in tracked files
    git grep -i -E "password\s*[:=]\s*['\"][^'\"]+['\"]" -- ":!tests" ":!src/db/seed.js"
    ```
- [ ] **Verify No Absolute or Machine-Specific Paths:**
  - Check that all test scripts, loaders, and docs use relative paths (`path.join(__dirname, ...)`).
  - Confirm user home paths (e.g. `C:\Users\...` or `/home/...`) do not exist in committed markdown, source code, or configuration files.
- [ ] **Verify Generated Database & Log Artifacts Are Ignored:**
  - Ensure `pgdata/`, `docker-data/`, `logs/`, `*.log`, `pids/`, `*.pid` are listed in `.gitignore`.
  - Confirm `node_modules/`, `coverage/`, `.nyc_output/`, `test-results/`, and `playwright-report/` are ignored.

---

## 2. Repository Visibility & Governance

- [ ] **Choose Repository Visibility:**
  - **Public:** Best for open-source showcase, portfolio, or public evaluation. Ensure all internal notes and test credentials are sanitized.
  - **Private:** Best for proprietary deployments or before formal security review.
- [ ] **Branch Configuration & Protection:**
  - Default branch name: `main`.
  - Recommended branch protection rules on GitHub:
    - Require pull request reviews before merging.
    - Require status checks to pass before merging (`npm test`, `npm run verify:flows`).
    - Enforce linear history (no merge commits) or squash merging.
- [ ] **Issue & Discussion Templates (Optional):**
  - Add `.github/ISSUE_TEMPLATE/` for bug reports and feature requests.
  - Add `.github/PULL_REQUEST_TEMPLATE.md` to ensure code contributions adhere to test coverage standards.

---

## 3. License & Legal Attribution

- [ ] **License Consistency:**
  - Verify `package.json` specifies `"license": "MIT"`.
  - Verify root `LICENSE` file contains the complete MIT License text with the appropriate copyright line:
    ```text
    Copyright (c) 2026 FlyRank
    ```
- [ ] **Third-Party Dependencies:**
  - All runtime dependencies (`express`, `pg`, `zod`, `jsonwebtoken`, `bcryptjs`, `cors`, `nodemailer`) use permissive open-source licenses (MIT/ISC/Apache-2.0/BSD-3-Clause).

---

## 4. Pre-Commit Quality & Verification Gate

Execute the complete verification pipeline locally before creating the first release commit. Every command must exit with code 0:

```bash
# 1. Run unit, integration, and security test suite (89 tests)
npm test

# 2. Run end-to-end integration flows across ports 3000 and 5500 (16 checks)
npm run verify:flows

# 3. Run real desktop browser automation via Playwright (17 checks)
npm run test:browser
```

Expected output:
- `npm test`: `✔ All tests passed (89/89)`
- `npm run verify:flows`: `✔ Flow Verification Summary: 16/16 checks passed (100%)`
- `npm run test:browser`: `✔ Browser Verification Summary: 17/17 checks passed (100%)`

---

## 5. First Commit & Push Instructions

When you are ready to publish, execute the following commands in your local terminal.

> [!WARNING]
> Do NOT run `git push` until you have personally inspected `git status` and confirmed that only intended files are staged.

### Step 5.1: Review Status
```bash
git status
```
Verify that `.env` and `pgdata/` are NOT listed in "Untracked files".

### Step 5.2: Stage All Clean Files
```bash
git add .
```

### Step 5.3: Verify Staged Files
```bash
git status
```
Ensure staged files include only:
- `src/` (Express API, database migration, models, middleware)
- `tests/` (Automated test suites)
- `scripts/` (Database management, verification, Playwright runner)
- `test-site/` (Standalone customer demo page on port 5500)
- `screenshots/` (Verified browser and dashboard screenshots)
- `README.md`, `DESIGN.md`, `EVIDENCE.md`, `BUILDLOG.md`, `MANUAL_QA.md`, `GITHUB_RELEASE_CHECKLIST.md`
- `package.json`, `package-lock.json`, `docker-compose.yml`, `capstone.yaml`, `LICENSE`, `.gitignore`, `.env.example`

### Step 5.4: Create the Initial Release Commit
```bash
git commit -m "feat: complete FlyRank embeddable widget & lead-capture platform"
```

### Step 5.5: Set Default Branch to `main`
```bash
git branch -M main
```

### Step 5.6: Add Remote & Push (Execute Only When Remote Repository is Created)
```bash
# Replace YOUR_USERNAME and YOUR_REPO with your actual GitHub username and repository name
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git

# Push to GitHub
git push -u origin main
```

---

## 6. Post-Push GitHub Configuration

- [ ] Check repository **Settings > Security > Code security and analysis**:
  - Enable **Dependabot alerts**.
  - Enable **Secret scanning** (available free for all public repositories).
- [ ] Add Repository About section:
  - Description: *Embeddable Widget & Lead-Capture Platform with Multi-Tenant Isolation, Geo Fallbacks, and Hardened Public Ingestion*
  - Topics: `multi-tenant`, `lead-capture`, `embeddable-widget`, `express`, `postgresql`, `playwright`
