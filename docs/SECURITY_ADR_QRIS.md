# ADR-001: Rejecting Client-Side Static-to-Dynamic QRIS Modification in Production

- **Status:** Accepted (Client-side QRIS mutation disabled; replaced with non-transactional sandbox invoice QR)
- **Context:** Alumni Scholarship Data Management Platform (Data Management Course Project, UPI)
- **Domain:** Payment Protocol Engineering (EMVCo MPM), Threat Modeling, Indonesian Financial Compliance

---

## 1. Motivation: Why the Prototype Was Built

During early development of the university alumni scholarship platform, we needed to solve two practical problems without a paid commercial payment gateway:

1. **Zero-Friction Donation UX:** Donors scanning a static QRIS code often mistype donation amounts or omit the 3-digit unique reconciliation code (e.g., `Rp 100,000` + `342` = `Rp 100,342`), breaking automated ledger matching.
2. **Cross-Division Transparency:** Non-treasury divisions needed live visibility into collected funds without asking the treasurer to manually check bank mutations.

To test whether amount-locked QR codes could be generated without a gateway API, we implemented a client-side **EMVCo Merchant-Presented Mode (MPM)** TLV parser and **CRC-16/CCITT-FALSE** calculator.

---

## 2. Technical Mechanism: EMVCo MPM TLV & CRC-16/CCITT-FALSE

Indonesian QRIS is built on the public **EMVCo QR Code Specification (MPM)**. Each field is encoded as `Tag (2 digits) + Length (2 digits) + Value`:

### 2.1 Verified Synthetic Example (100% Dummy Merchant)

Static dummy payload (`Tag 01 = 11`, no `Tag 54`, `Tag 63 = 1295`):
```text
00020101021126440018ID.EXAMPLE.SANDBOX01189999000000000000015204599953033605802ID5919SANDBOX SCHOLARSHIP6007BANDUNG61054015463041295
```

Dynamic dummy payload for `Rp 100,342` (`Tag 01 = 12`, inserted `Tag 54 = 5406100342`, recomputed `Tag 63 = 8031`):
```text
00020101021226440018ID.EXAMPLE.SANDBOX011899990000000000000152045999530336054061003425802ID5919SANDBOX SCHOLARSHIP6007BANDUNG61054015463048031
```

### 2.2 Why Banking Apps Accept a Client-Modified Payload
Payment apps validate:
1. Valid TLV length boundaries across all tags.
2. Expected ISO codes (`5303360` for IDR, `5802ID` for Indonesia).
3. Valid trailing **CRC-16/CCITT-FALSE** checksum (polynomial `0x1021`, initial value `0xFFFF`) computed over all characters up to and including `6304`.

Because EMVCo MPM strings carry **no asymmetric cryptographic signature**, any client can recompute a valid checksum after modifying fields.

---

## 3. Security Threat Model (Why It Fails Production Review)

### 3.1 CRC-16 Is Error Detection, Not Authentication
CRC-16 was designed strictly to catch optical scanning corruption (scratched stickers, poor camera focus). It provides zero proof of origin or tamper resistance.

### 3.2 Merchant-Swap / Silent Fund Redirection (XSS & Supply Chain Risk)
Because the QR payload is assembled in browser JavaScript:
- Any attacker who achieves XSS, compromises a third-party script, or injects code into the static bundle can overwrite **Tags `26-51`** (Merchant Account Information / NMID / Acquirer routing) with an attacker-controlled account.
- Crucially, the attacker can keep **Tag `59` (Merchant Name)** identical or visually deceptive (`"Lembaga Beasiswa Alumni"`), recompute CRC-16, and render a valid QR code.
- Donors scanning the QR code see a plausible merchant label and pre-filled amount, silently redirecting scholarship funds to the attacker.

### 3.3 Missing Server-Side Invoice Lifecycle Controls
Legitimate dynamic QRIS invoices issued by a licensed **PJP (Penyedia Jasa Pembayaran)** bind the QR payload to a server-side invoice record with:
- A unique **External Reference ID** tracked by the acquirer.
- A strict **expiration timestamp (TTL)**.
- **Single-use enforcement** preventing duplicate charges on an already-settled invoice.

A client-mutated static QRIS payload has none of these controls and can be replayed indefinitely.

### 3.4 Email Notification Scraping Fragility
Pairing client-side QRIS mutation with automated Gmail regex parsing (`Code.gs`) introduces additional failure modes:
- Provider email template changes silently break amount extraction.
- Unauthenticated or spoofed inbound emails matching regex heuristics risk false-positive settlement approvals without cryptographic webhook verification.

---

## 4. Indonesian Legal & Regulatory Compliance Analysis

| Regulation | Relevant Provisions & Compliance Impact |
| :--- | :--- |
| **PADG BI No. 21/18/PADG/2019** | *Pasal 3, 6, 10, 24* establish national QRIS governance: QRIS issuance, routing, and dynamic QRIS generation are regulated operations performed by licensed **PJP** and switching institutions under Bank Indonesia oversight. |
| **PADG BI No. 24/1/PADG/2022** | *Pasal 8* amends QRIS implementation rules, including the maximum Rp 10,000,000 per-transaction limit and acquirer compliance responsibilities. |
| **PBI No. 23/6/PBI/2021** | Regulates Payment Service Providers (PJP), mandating licensing, security controls, and consumer protection for payment initiation systems. |
| **UU ITE (UU No. 11/2008 jo. UU No. 1/2024)** | *Pasal 15-16* require Electronic System Operators (PSE) to guarantee reliability, security, and transaction integrity. Client-side payment payload tampering weakens transaction integrity and shifts liability onto the operator. |
| **UU PDP (UU No. 27 Tahun 2022)** | Mandates protection of personal data. Addressed in this repository by masking donor names, student IDs, and phone numbers before exposing records to public views or Looker Studio dashboards. |
| **PJP / Acquirer Terms of Service** | Acquirers (e.g., DANA Bisnis, GoPay Merchant, bank acquirers) prohibit altering issued static QRIS strings outside authorized merchant APIs; violations risk account suspension or frozen settlement funds. |

---

## 5. Decision & Compliant Production Blueprint

### Decision
1. **Exclude** all real static merchant QRIS strings, QRIS images, and client-side EMVCo mutation code from this repository.
2. **Replace** the browser QR renderer with a non-transactional sandbox invoice payload (`SANDBOX_INVOICE|...`) for UI walkthroughs only.
3. **Adopt** the server-side PJP / SNAP BI architecture below for any production deployment.

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

### Mandatory Production Controls
- **Server-Minted Dynamic QRIS:** Obtain QR strings exclusively from a licensed PJP API or direct **SNAP BI** integration.
- **Cryptographically Signed Webhooks:** Verify HMAC-SHA256 or asymmetric RSA signatures and enforce idempotency before updating ledger status.
- **Strict CSP & SRI:** Pin third-party frontend scripts with Subresource Integrity hashes and lock down script origins via Content-Security-Policy.
- **Server-Side Admin Auth:** Replace demo login checks with OAuth 2.0 / OIDC (e.g., Google Workspace SSO with RBAC) for the internal reconciliation portal.
