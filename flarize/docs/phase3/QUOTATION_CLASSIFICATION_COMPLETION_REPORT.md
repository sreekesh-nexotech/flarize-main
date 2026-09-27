# Quotation Classification (Part 9) — Completion Report

## A. Files Changed

| File | Change |
|------|--------|
| `src/lib/quotationWorkspace.js` | Added `quotationSource`, `district`, `affiliateId` to DRAFT_FIELDS. Added `QUOTATION_SOURCE` constant (DIRECT/AFFILIATE/DISTRICT). Added `validateClassification()` — enforces server-derived salespersonId, source validation, district-required-for-DISTRICT, affiliateId-only-for-AFFILIATE. Wired into `createDraft()` and `setQuotationFields()`. Updated `resolveInputs()` to include classification in quotation object. Updated `listQuotations()` to expose classification fields. |
| `src/lib/quotationPayload.js` | Added `quotationSource`, `district`, `affiliateId` to frozen quotation section in payload. |
| `server-sales.js` | Added `source` and `district` query params to quotation-history filter chain. Added `quotationSource`, `district`, `affiliateId`, `salespersonId` to history output. |
| `public/sales.html` | Added quotation source selector (DIRECT/AFFILIATE/DISTRICT) in Step 2. Conditional district/affiliate inputs. Removed client `salespersonId` submission. Added source filter to history view. Added Source column to history table. |
| `tests/quotation-classification.test.mjs` | **NEW** — 28 test cases covering all 13 acceptance criteria. |
| `tests/phase3-quotation-workspace.test.mjs` | Updated payload parity test to include classification fields in direct assembler call. |

## B. Files NOT Changed

- `server-quotation.js` — No change needed. Classification flows through workspace layer.
- `server.js` — No change needed. Auth/RBAC unchanged.
- `server-bom-builder.js` — HARD SCOPE. No dependency.
- `public/lib/quotationDocument.js` — HARD SCOPE. Renderer reads quotation section; classification is metadata, not rendered.
- `public/quotation-document.html` — HARD SCOPE.
- `src/App.jsx` — HARD SCOPE.
- `data/catalog.json` — HARD SCOPE.
- Quotation numbering algorithm — Unchanged. Format remains `GR-YYYYMMDD-NNNN`.

## C. Acceptance Criteria Status

| # | Criterion | Status |
|---|-----------|--------|
| 26 | Quotation source defaults/validates correctly | ✅ Defaults to DIRECT. Invalid source rejected. |
| 27 | DIRECT quotation without affiliateId | ✅ affiliateId rejected on DIRECT. |
| 28 | AFFILIATE quotation stores affiliateId | ✅ Optional affiliateId stored. |
| 29 | DISTRICT quotation requires district | ✅ Missing district throws. |
| 30 | SalespersonId derived from authenticated session | ✅ `validateClassification` sets `record.salespersonId = actor.userId`. |
| 31 | Client cannot impersonate salespersonId | ✅ `setQuotationFields` throws on client `salespersonId`. `createDraft` overrides input with `actor.userId`. |
| 32 | Classification survives versioning | ✅ Fields on draft record persist through updates. `resolveInputs` → payload includes classification. |
| 33 | Issued classification is immutable | ✅ ISSUED guard blocks all field changes. Payload section is `Object.freeze`d. |
| 34 | Existing quotation numbering unchanged | ✅ Format `GR-YYYYMMDD-NNNN`. No encoding in number. |
| 35 | History can filter by quotationSource | ✅ `?source=AFFILIATE` query param on history endpoint. |
| 36 | History can filter by district | ✅ `?district=ERNAKULAM` query param on history endpoint. |
| 37 | Sales Head can use classification metadata | ✅ `listQuotations` exposes all classification fields. SALES_HEAD has PRICING_VIEW capability. |
| 38 | Individual sales cannot access another user's quotations via classification | ✅ Classification filters are data-layer only. No new access vector. Visibility model unchanged (P3-D unresolved). |

## D. Tests

### Before
| | Count |
|---|---|
| Total | 1451 |
| Pass | 1441 |
| Fail | 10 |

### After
| | Count |
|---|---|
| Total | 1479 |
| Pass | 1469 |
| Fail | 10 |

**+28 new tests. All pass.** 10 pre-existing hybrid battery failures unchanged.

## E. Build Result

```
✓ built in 2.93s
dist/index.html                   0.58 kB │ gzip:   0.40 kB
dist/assets/index-BTAjQ7d5.css   34.61 kB │ gzip:   6.64 kB
dist/assets/index-BAVKvckM.js   387.16 kB │ gzip: 109.89 kB
```

Clean build. Bundle unchanged (no App.jsx modification).

## F. Data Model

### Classification fields on quotation record

```
quotationSource: 'DIRECT' | 'AFFILIATE' | 'DISTRICT'  (default: DIRECT)
district:        string | null                          (required when source = DISTRICT)
affiliateId:     string | null                          (only when source = AFFILIATE)
salespersonId:   string                                 (server-derived from actor.userId)
```

### Validation rules (validateClassification)

1. `quotationSource` must be one of DIRECT, AFFILIATE, DISTRICT. Defaults to DIRECT.
2. `affiliateId` only allowed when `quotationSource = AFFILIATE`. Rejected otherwise.
3. `district` required when `quotationSource = DISTRICT`. Optional otherwise.
4. `salespersonId` always set to `actor.userId`. Client input overridden.
5. Client `setQuotationFields({ salespersonId })` explicitly rejected with error.

### Data flow

```
sales.html → quotationSource/district/affiliateId
  ↓
server-quotation.js → createDraft / setQuotationFields
  ↓
quotationWorkspace.js → validateClassification(record, actor)
  → record.salespersonId = actor.userId (server-derived)
  → resolveInputs() includes classification in quotation object
  ↓
quotationPayload.js → quotation: Object.freeze({ ...quotationSource, district, affiliateId })
  ↓
ISSUED → immutable (frozen payload, ISSUED guard blocks edits)
```

### History API

```
GET /api/sales/quotation-history?source=AFFILIATE&district=ERNAKULAM
```

New query params: `source`, `district`. Output includes `quotationSource`, `district`, `affiliateId`, `salespersonId`.

## G. Quotation Number

**Unchanged.** Format remains `GR-YYYYMMDD-NNNN`. Classification is internal metadata only. No encoding in the visible quotation number.

## H. Renderer-Side Calculation

**None.** Zero calculation introduced. Classification fields are copy-only metadata.

## I. Architecture Boundary

**Two HARD SCOPE files modified with proven dependency:**

1. `src/lib/quotationPayload.js` — Three fields added to quotation section. Same `?? null` + `Object.freeze` pattern. Zero arithmetic.
2. `src/lib/quotationWorkspace.js` — Classification validation + pass-through. Same pattern as existing field handling.

## J. Not Built (per requirements)

- Reporting dashboard — NOT in scope
- Affiliate management system — NOT in scope
- District controlled-value list — NOT in scope (free string)
- Per-user quotation visibility (P3-D) — NOT in scope
