# Company Master + Customer Quotation Inputs — Completion Report

## A. Files Inspected

| File | Purpose |
|------|---------|
| `server.js` | Auth, RBAC, route registration |
| `server-sales.js` | Customer CRUD, quotation history |
| `server-quotation.js` | Quotation HTTP transport |
| `server-workspace.js` | Workspace init, quotation init wiring |
| `src/lib/quotationPayload.js` | Payload assembler — company section |
| `src/lib/quotationWorkspace.js` | Service layer — buildPayload, issueQuotation |
| `public/lib/quotationDocument.js` | Renderer — company/customer field expectations |
| `public/sales.html` | Sales wizard — customer form, quotation object |
| `src/App.jsx` | SPA — customer object (not modified) |
| `data/customers.json` | Customer data model |

## B. Files Changed

| File | Change |
|------|--------|
| `data/company-profile.json` | **NEW** — Company profile store (initialised as null) |
| `server-company.js` | **NEW** — Company profile CRUD (GET/PUT admin, GET sales read-only), GSTIN/IFSC/pincode/phone/email validation, quotation shape builder |
| `server.js` | Added company module registration and init |
| `server-workspace.js` | Wired company profile function into quotation init |
| `server-quotation.js` | Accepts + passes `companyProfile` to workspace (payload + issue routes) |
| `server-sales.js` | Added `billCycle` to customer create and updatable fields |
| `src/lib/quotationPayload.js` | **PROVEN DEPENDENCY** — Added `companyProfile` parameter; company section now uses input if provided, else `blockedSection(COMPANY_MASTER)` |
| `src/lib/quotationWorkspace.js` | **PROVEN DEPENDENCY** — Passes `companyProfile` through `buildPayload`, `issueQuotation`, `buildAlternativePayloads` |
| `public/sales.html` | Added bill cycle selector (MONTHLY/BIMONTHLY); added `currentBillAmount` and `currentBillCycle` to quotation customer object; added `billCycle` to createCustomer API call |
| `public/company-profile.html` | **NEW** — Admin UI for company profile management |
| `tests/company-master.test.mjs` | **NEW** — 15 test cases for company profile + customer inputs |
| `tests/phase3-quotation.test.mjs` | Updated company dependency assertion: C7 → COMPANY_MASTER |
| `tests/phase3-quotation-transport.test.mjs` | Updated company dependency assertion |
| `tests/phase3-quotation-document.test.mjs` | Updated company dependency assertion (2 locations) |
| `tests/phase3-quotation-workspace.test.mjs` | Updated company dependency assertion |
| `tests/phase3-quotation-ui.test.mjs` | Updated company dependency assertion |

## C. Files Intentionally NOT Changed

- `src/App.jsx` — HARD SCOPE. Customer object in SPA will need updating separately when SPA is modified for customer inputs.
- `server-bom-builder.js` — HARD SCOPE. No dependency.
- BOM/profile selection logic — no dependency.
- Procurement system — no dependency.
- `public/lib/quotationDocument.js` — HARD SCOPE. No modification needed — renderer already expects `company.available`, `company.value.gstNumber`, `company.value.companyRegistration`, `customer.currentBillAmount`, `customer.currentBillCycle`. These field names are now populated by the pipeline.
- `public/quotation-document.html` — HARD SCOPE. No modification needed.
- Original quotation artwork/assets — HARD SCOPE. Untouched.
- `data/catalog.json` — HARD SCOPE. Untouched.

## D. Exact Reason for Every Changed File

1. **`data/company-profile.json`** — New data store for admin company profile. Null until admin saves.

2. **`server-company.js`** — New module: admin CRUD for company profile with validation (GSTIN 15-char format, IFSC 11-char, 6-digit pincode, 10-digit phone, email format). Sales can read-only. Exports `getQuotationCompanyProfile()` for payload pipeline.

3. **`server.js`** — Register company module (addRoute + init). Same pattern as sales/workspace registration.

4. **`server-workspace.js`** — Wire `getCompanyProfile` function into quotation init. Same pattern as `getCmsStore`.

5. **`server-quotation.js`** — Accept `getCompanyProfile` in init. Pass company profile to workspace buildPayload and issueQuotation. Same pattern as cmsStore.

6. **`server-sales.js`** — Add `billCycle` to customer create (line 189) and updatable fields (line 202). Customer model now captures billing cycle.

7. **`src/lib/quotationPayload.js`** — PROVEN DEPENDENCY. Added `companyProfile = null` parameter. Company section: `companyProfile ? Object.freeze(companyProfile) : blockedSection(COMPANY_MASTER)`. Same pattern as customer (line 550-552). Zero arithmetic, zero derivation.

8. **`src/lib/quotationWorkspace.js`** — PROVEN DEPENDENCY. Passes `companyProfile` through three functions: `buildPayload()`, `issueQuotation()`, `buildAlternativePayloads()`. Pure pass-through — same pattern as `catalog`/`cmsStore`.

9. **`public/sales.html`** — Added bill cycle dropdown (MONTHLY/BIMONTHLY). Mapped `currentBillAmount: selectedCustomer.currentBill` and `currentBillCycle: selectedCustomer.billCycle` into quotation customer object. Added `billCycle` to createCustomer API call.

10. **`public/company-profile.html`** — New admin UI page. Login (same credential), form sections for company identity/contact/payment, validation feedback, save status indicator.

11. **Tests** — Updated 5 existing test files to expect `COMPANY_MASTER` instead of `DECISION_C7_COMPANY_IDENTITY` (the blocked dependency name changed). New test file covers 15 cases.

## E. Tests Before

| | Count |
|---|---|
| Total tests | 1435 |
| Pass | 1425 |
| Fail | 10 |

## F. Tests After

| | Count |
|---|---|
| Total tests | 1451 |
| Pass | 1441 |
| Fail | 10 |

**+16 new tests added. All pass.** 10 pre-existing hybrid battery failures unchanged.

## G. Build Result

```
✓ built in 2.94s
dist/index.html                   0.58 kB │ gzip:   0.40 kB
dist/assets/index-BTAjQ7d5.css   34.61 kB │ gzip:   6.64 kB
dist/assets/index-BAVKvckM.js   387.16 kB │ gzip: 109.89 kB
```

**Clean build. No warnings. No errors.** Bundle unchanged (no App.jsx modification).

## H. Remaining Failures

All 10 failures are **pre-existing hybrid battery profile issues** (catalog.json HARD SCOPE):

1. profile hybrid_value declares one battery
2-5. D1 FIXED — hybrid 3/5/8/10kW value is battery-consistent
6. Issue1: hybrid_value profile exists with battery
7. Issue1: changing tier changes battery config for hybrid
8. Issue2: batConfig only applies to hybrid system type
9. 1C hybrid value: quantity comes from the profile (1)
10. C50 — hybrid Value resolves bt1, is BLOCKED, and is NOT emptied

**Zero new failures introduced.**

## I. Architecture Boundary Crossing

**Yes — two HARD SCOPE files modified with proven dependency:**

1. `src/lib/quotationPayload.js` — Company section was hardcoded `blockedSection(DECISION_C7_COMPANY_IDENTITY)`. To accept admin-configured company data, added `companyProfile` parameter. Same freeze-or-block pattern as customer (line 550-552). Zero new arithmetic, zero new logic.

2. `src/lib/quotationWorkspace.js` — Pass-through of `companyProfile` from transport to assembler. Same pattern as catalog/cmsStore pass-through. No new logic.

**Both changes use existing patterns. No architecture redesign.**

## J. Renderer-Side Calculation Introduced

**No.** Zero calculation introduced anywhere. The only new code paths are:
- `server-company.js`: CRUD + validation (string checks, no arithmetic)
- `quotationPayload.js`: `companyProfile ? freeze(input) : blockedSection()` (copy, no derivation)
- `quotationWorkspace.js`: parameter pass-through

## K. Hardcoded Company/Customer Data

**None.** Verified by test:
- No GSTIN pattern in assembler source
- No company name in assembler code
- All company data flows from `data/company-profile.json` → server → payload → renderer
- All customer bill data flows from customer record → quotation object → payload → renderer

## L. Issued Quotation Immutability

**Preserved.** Company profile follows the same pattern as catalog:
- DRAFT quotations: company data read fresh from file (always current) ✓
- ISSUED quotations: payload is frozen at issuance (includes company snapshot) ✓
- Historical versions: document versions retain their frozen company data ✓
- The `issueQuotation` function receives `companyProfile`, includes it in the frozen document

## M. Data Flow Summary

```
ADMIN
  ↓
data/company-profile.json (server-company.js)
  ↓
server-quotation.js → getCompanyProfile()
  ↓
quotationWorkspace.js → buildPayload({ companyProfile })
  ↓
quotationPayload.js → company: freeze(companyProfile) | blockedSection
  ↓
quotationDocument.js → company.value.gstNumber, .companyRegistration (renderer reads only)
```

```
SALES
  ↓
public/sales.html → createCustomer({ billCycle })
  ↓
server-sales.js → customer store (with billCycle)
  ↓
sales.html → customer: { currentBillAmount, currentBillCycle }
  ↓
quotation draft → customer snapshot
  ↓
quotationPayload.js → customer: freeze({ ...customer })
  ↓
quotationDocument.js → currentBillText(customer) (renderer reads only)
```

## N. API Endpoints Added

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/api/admin/company-profile` | Admin | Read full company profile |
| PUT | `/api/admin/company-profile` | Admin | Save company profile |
| GET | `/api/sales/company-profile` | Admin | Read company profile (sales-facing view) |

## O. Validation Rules (server-company.js)

| Field | Rule |
|-------|------|
| GSTIN | 15-char format: `\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z0-9]` |
| IFSC | 11-char format: `[A-Z]{4}0[A-Z0-9]{6}` |
| Pincode | 6-digit: `[1-9]\d{5}` |
| Phone | 10-digit Indian mobile: `[6-9]\d{9}` |
| Email | Basic format: `[^\s@]+@[^\s@]+\.[^\s@]+` |

All validations optional (empty/null allowed). Only validated when provided.

## P. Admin UI

New page: `public/company-profile.html`

Sections:
1. Company Identity — Legal name, display name, GSTIN, registration number
2. Contact Details — Address, city, state, pincode, phone, email, website
3. Payment Details — Bank name, account name, account number, IFSC, payment instructions

Access: Admin login required (same credential). Status indicator shows configured/not-configured.
