# Alumni Scholarship Data Management & Transparency Platform

A serverless data management, reconciliation, and public transparency platform built for university alumni scholarship funds (IKA UPI case study). Designed around **Segregation of Duties**, **UU PDP (Indonesia Law No. 27/2022)** privacy masking, and automated ledger reconciliation with **Google Apps Script**, **Google Sheets**, **Looker Studio**, and dual-site **Netlify** deployment.

> **Sandbox Notice:** This public repository runs in local demo mode (`DEFAULT_DEMO_MODE: true`) using synthetic alumni records and non-transactional sandbox payment payloads. All live credentials, personal emails, bank account numbers, and merchant QRIS strings have been removed.

---

## Why This Exists

Student and alumni scholarship boards typically face three operational bottlenecks:

1. **Treasury Bottleneck:** Non-treasury divisions (PR, Outreach, Scholarship Committee) must repeatedly ask the treasurer for balance updates and donor confirmations.
2. **Unclaimed Direct Transfers ("Silent Donors"):** Alumni transfer directly to the foundation account without filling out a form, leaving unattributed inflows in the ledger.
3. **PII Exposure Risk:** Publishing raw spreadsheets for transparency leaks donor full names, student IDs, and WhatsApp numbers, violating Indonesia's Personal Data Protection Law (**UU No. 27 Tahun 2022 / UU PDP**).

This platform separates public donor intake from internal reconciliation, automates privacy masking before data reaches public views or BI dashboards, and gives every division a read-only transparency view without exposing treasury bank credentials.

---

## System Architecture

```text
+-----------------------------------+       +------------------------------------+
|  Portal 1: dist_donatur/          |       |  Portal 2: dist_admin/             |
|  Public Donor & Transparency UI   |       |  Internal Governance & Recon UI    |
|  (Zero links to admin portal)     |       |  (Zero cross-links to donor UI)    |
+-----------------+-----------------+       +------------------+-----------------+
                  |                                            |
                  +---------------------+----------------------+
                                        | HTTPS JSON API
                                        v
                   +----------------------------------------+
                   |  Google Apps Script Backend (Code.gs)  |
                   |  - 3-Path Donor Intake & Validation    |
                   |  - UU PDP PII Masking Pipeline         |
                   |  - Ledger Reconciliation Engine        |
                   |  - Telegram / Email Dispatchers        |
                   +-------------------+--------------------+
                                       |
                     +-----------------+-----------------+
                     |                                   |
                     v                                   v
      +-----------------------------+     +-----------------------------+
      |  Google Sheets Data Store   |     |  Google Looker Studio BI    |
      |  - master_alumni            |     |  - Masked Public Analytics  |
      |  - raw_donations (Ledger)   |     |  - Faculty & Cohort Rollups |
      |  - public_masked_view       |     |  - Settlement Breakdown     |
      +-----------------------------+     +-----------------------------+
```

### Key Architectural Controls

| Control | Implementation | Verification |
| :--- | :--- | :--- |
| **Dual-Portal Isolation** | Separate deployable bundles (`dist_donatur/` and `dist_admin/`) hosted on independent Netlify sites. | Automated check in `build_dist.js` fails the build if any cross-link exists or if stray `.html` files appear in the repo root. |
| **Segregation of Duties** | Treasury manages settlement approvals; other divisions consume real-time totals and masked faculty analytics via the transparency dashboard and Looker Studio. | Cash reconciliation invariant (`Total Collected = Treasury Cash + Gateway Cash`) verified in `test_system.js`. |
| **3-Path Donor Ingestion** | Supports **Path 1** (Verified Alumni NIM lookup), **Path 2** (Fast-Track Onboarding for unlisted alumni), **Path 3** (Express Anonymous), plus **Silent Donor** (`UNCLAIMED_DIRECT_TRANSFER`) matching. | 5 representative test scenarios validated in `test_system.js`. |
| **UU PDP Privacy Masking** | Masks donor names (`Fadhil Ramadhan` -> `Fa*** Ra***`) and WhatsApp numbers (`08122001234` -> `0812****234`) before rendering in public feeds. | Unit-tested in `test_system.js` (Test 6). |

---

## Security & Compliance ADR: Why Client-Side QRIS Modification Was Rejected

During early prototyping, we investigated generating dynamic payment QR codes on the client by parsing a static **EMVCo Merchant-Presented Mode (MPM)** QRIS string, switching the Point of Initiation Method (`010211` -> `010212`), inserting Tag `54` (Transaction Amount), and recomputing the **CRC-16/CCITT-FALSE** checksum (Tag `63`).

While this works at the parser level because EMVCo MPM QR payloads use a plain-text TLV structure, **we deliberately rejected client-side QRIS mutation for production** and replaced it with a non-transactional sandbox invoice QR in this repository.

### Summary of Findings (Full Analysis in [docs/SECURITY_ADR_QRIS.md](docs/SECURITY_ADR_QRIS.md))

1. **CRC-16 Is a Checksum, Not a Cryptographic Signature:** Any actor who compromises the frontend (XSS, supply-chain script, or malicious pull request) can alter not only Tag `54` (amount) but also Tags `26-51` (Merchant Account Information / NMID) while keeping Tag `59` (Merchant Name) visually identical, recompute CRC-16, and silently redirect donor funds to an attacker's wallet.
2. **Missing Server-Side Lifecycle Controls:** Client-mutated static QRIS strings carry no server-issued transaction reference, no expiration window, and no single-use lock at the acquiring PJP.
3. **Regulatory & Acquirer Compliance:** Under **Bank Indonesia PADG No. 21/18/PADG/2019** (and **PADG No. 24/1/PADG/2022**), dynamic QRIS generation is a licensed **PJP (Penyedia Jasa Pembayaran)** responsibility, and mutating a static merchant QR violates acquirer Terms of Service.
4. **Email Scraping Is Not a Settlement Source of Truth:** Parsing inbox notifications via regex (`Code.gs`) is suitable only for an academic prototype; production settlement requires cryptographically signed webhooks (HMAC-SHA256 / RSA) from a licensed PJP or **SNAP BI** API.

Read the complete threat model and production migration blueprint in [docs/SECURITY_ADR_QRIS.md](docs/SECURITY_ADR_QRIS.md).

---

## Repository Structure

```text
alumni-scholarship-data-platform/
├── dist_donatur/              # Standalone public donor & transparency portal (Netlify Site A)
│   └── index.html
├── dist_admin/                # Standalone internal governance & reconciliation portal (Netlify Site B)
│   └── index.html
├── docs/
│   └── SECURITY_ADR_QRIS.md   # EMVCo/QRIS threat model, BI regulatory analysis & SNAP BI target design
├── assets/                    # Static logos and typography assets
├── Code.gs                    # Google Apps Script backend (API, masking, reconciliation, Drive archive)
├── Notification.gs            # Automated email & receipt notification module (GAS)
├── Seeder.gs                  # Synthetic database seeder for Google Sheets (25 alumni, 5 ledger cases)
├── appsscript.json            # Google Apps Script manifest
├── config.js                  # Shared frontend configuration (defaults to safe local sandbox mode)
├── seed_data.js               # Local sandbox dataset (25 synthetic alumni, 5 representative cases)
├── styles.css                 # Shared UI design tokens and component styles
├── netlify.toml               # Netlify static hosting & security header configuration
├── build_dist.js              # Dual-site asset sync & Segregation-of-Duties build validator
├── test_system.js             # Automated unit & integration test suite (10 test cases)
├── LICENSE                    # MIT License
└── README.md
```

---

## Running Locally & Verification

Prerequisites: **Node.js 18+** (no external npm packages required).

```bash
# 1. Sync shared assets and verify Dual-Portal Segregation of Duties
node build_dist.js

# 2. Run the automated unit & integration test suite (10/10 tests)
node test_system.js
```

To preview either portal in local sandbox mode (`DEFAULT_DEMO_MODE: true`), open `dist_donatur/index.html` or `dist_admin/index.html` through any static file server:

```bash
npx serve dist_donatur
# or
npx serve dist_admin
```

For Google Apps Script cloud deployment, replace `YOUR_GAS_DEPLOYMENT_ID` in `config.js`, configure `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, and `MANAGER_EMAIL` in GAS **Script Properties** (never hardcode secrets in source files), and set `DEFAULT_DEMO_MODE: false`.

---

## Author

**Zufar Ahmad Maulidy**
Computer Science Student, Universitas Pendidikan Indonesia (UPI)
GitHub: [@Zeiyth-24](https://github.com/Zeiyth-24) | LinkedIn: [linkedin.com/in/zufarahmad](https://www.linkedin.com/in/zufarahmad/)
