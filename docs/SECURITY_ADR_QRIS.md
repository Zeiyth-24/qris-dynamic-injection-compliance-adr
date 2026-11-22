# ADR-001: Rejecting Client-Side Static-to-Dynamic QRIS Modification in Production

- **Status:** Accepted (Client-side QRIS mutation disabled; replaced with sandbox invoice QR in public repo)
- **Context:** Alumni Scholarship Data Management Platform (Data Management Course Project, UPI)
- **Domain:** Payment Security, Threat Modeling, Bank Indonesia Regulatory Compliance

---

## 1. Context & Original Prototype

To reduce friction for donors scanning a foundation QRIS code, the initial academic prototype explored converting a static **EMVCo Merchant-Presented Mode (MPM)** QRIS string into an amount-locked dynamic QR code directly in the browser:

1. Parse the static QRIS TLV (Tag-Length-Value) string (`000201010211...`).
2. Change Tag `01` (Point of Initiation Method) from `11` (static) to `12` (dynamic).
3. Insert Tag `54` (Transaction Amount) containing the exact donation amount plus a 3-digit unique reconciliation code.
4. Recompute Tag `63` (4-character **CRC-16/CCITT-FALSE** checksum, polynomial `0x1021`, init `0xFFFF`).

Because banking and e-wallet apps validate the EMVCo TLV structure and the trailing CRC-16 checksum before displaying the merchant name and pre-filled amount, a client-modified payload is technically scannable.

---

## 2. Threat Model & Why It Fails Security Review

### 2.1 CRC-16 Is Error Detection, Not Cryptographic Integrity
EMVCo MPM QRIS strings are not signed with a private key. The trailing Tag `63` CRC-16 only detects accidental bit corruption during optical scanning. It does **not** prove that the merchant or acquiring bank generated the string.

### 2.2 Merchant-Swap / Silent Fund Redirection Attack (XSS & Supply Chain)
Because the QR payload is assembled in client-side JavaScript:
- Any attacker who achieves XSS, compromises a third-party CDN script, or tampers with the static bundle can replace Tags `26-51` (Merchant Account Information / NMID / Acquirer Routing) with their own merchant identifier.
- Crucially, the attacker can keep **Tag `59` (Merchant Name)** set to `"Lembaga Beasiswa Alumni"` or a visually similar label, recompute CRC-16, and render a valid QR code.
- Donors scanning the QR code may not notice the discrepancy before confirming payment, silently redirecting scholarship funds to an attacker's account.

### 2.3 Missing Server-Side Lifecycle Controls
Legitimate dynamic QRIS invoices minted by an acquiring **PJP (Penyedia Jasa Pembayaran)** bind the QR payload to a server-side invoice record with:
- A unique **Reference ID / External ID** tracked by the acquirer.
- A strict **expiration timestamp** (TTL).
- **Single-use enforcement** (preventing duplicate payments on an already-settled invoice).

A client-mutated static QRIS payload has none of these guarantees: the same QR can be replayed indefinitely, and the acquirer has no knowledge of the expected invoice ID.

### 2.4 Email Notification Scraping Fragility
Pairing client-side QRIS mutation with automated Gmail regex parsing (`Code.gs`) introduces additional failure modes:
- Email template changes by the e-wallet provider silently break reconciliation.
- Unauthenticated or spoofed inbound emails matching regex heuristics risk false-positive settlement approvals unless strictly filtered by DKIM/SPF and sender identity.

---

## 3. Regulatory & Compliance Analysis (Indonesia)

Under Bank Indonesia's payment system framework:
- **PADG No. 21/18/PADG/2019** (Implementation of the National Standard Quick Response Code for Payments / QRIS) and its amendment **PADG No. 24/1/PADG/2022** govern QRIS issuance, transaction limits (Rp 10,000,000 per transaction), and dynamic QRIS generation through licensed **PJP** entities.
- **PBI No. 23/6/PBI/2021** (Payment Service Providers) requires payment initiation and merchant onboarding to operate under licensed PJP oversight and consumer protection controls.
- **Acquirer Terms of Service:** Re-encoding or programmatically altering a static merchant QRIS payload issued by a PJP (e.g., DANA Bisnis, GoPay Merchant, bank acquirers) without an authorized merchant API violates standard merchant agreements and can lead to account suspension or frozen settlement funds.

---

## 4. Decision & Target Production Architecture

### Decision
1. **Remove** all real static merchant QRIS strings, QRIS images, and client-side EMVCo mutation code from this repository.
2. **Replace** the browser QR renderer with a clearly labeled, non-transactional sandbox invoice QR (`SANDBOX_INVOICE|...`) for UI demonstration only.
3. **Document** the compliant production architecture below.

### Production Target Architecture

```text
Donor Browser
   |  1. POST /api/donations (amount, donor metadata)
   v
Backend API (Authenticated Server, NOT browser JS)
   |  2. Signed Server-to-Server Request (SNAP BI / Midtrans / Xendit / Official PJP)
   v
Licensed PJP / Acquirer
   |  3. Returns official Dynamic QRIS string + invoice_id + expires_at
   v
Donor Browser (Renders server-issued QR string under strict Content-Security-Policy)
   |
   |  4. Donor pays via bank / e-wallet app
   v
Licensed PJP -> Webhook (HTTPS POST + HMAC-SHA256 / RSA Signature) -> Backend API
   |  5. Backend verifies signature, amount, and idempotency key
   v
Ledger Database (Marked SETTLED) -> Masked Public Transparency View & Looker Studio
```

### Required Security Controls for Production
- **Server-Minted Dynamic QRIS:** Obtain QR strings exclusively from a licensed PJP API (e.g., Midtrans, Xendit, DOKU, or direct **SNAP BI** integration).
- **Cryptographically Signed Webhooks:** Verify HMAC-SHA256 or asymmetric RSA signatures and enforce idempotency before updating ledger status.
- **Strict Content Security Policy (CSP) & SRI:** Pin frontend scripts with Subresource Integrity hashes and restrict script execution origins to prevent DOM/QR tampering.
- **Server-Side Authentication:** Replace demo login checks with OAuth 2.0 / OIDC (e.g., Google Workspace SSO with role-based access control) for the internal admin portal.
