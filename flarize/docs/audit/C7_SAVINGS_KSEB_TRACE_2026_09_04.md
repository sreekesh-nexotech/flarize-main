# C7 · Savings dailySavings · KSEB refund — Read-Only Trace

**Date:** 2026-09-04
**Scope:** READ-ONLY. No code changed. No approved HTML modified. No template edits. No Malayalam. No Page 4.
**Purpose:** three parallel traces to inform the next implementation gate:
- Track 1 · **C7 company identity** — which entity issues quotations, what the artwork claims vs data
- Track 2 · **savings dailySavings** — smallest additive engine extension to clear `SAVINGS_ENGINE_MISSING_DAILY_FIELD`
- Track 3 · **KSEB refund** — where Page 9's "5kw – Rs 4000" figure would come from

Every one of them is a data / engine extension. None modifies the renderer, the approved HTML, or a protected file yet — Step 1's atomic-file discipline still holds.

---

## Track 1 · C7 — Company Identity

### Two entity names in circulation

**Entity A — `Flarize Technologies Pvt. Ltd.`** (declared authoritative in `data/company-profile.json`):

| Field | Value |
|---|---|
| legalName | Flarize Technologies Pvt. Ltd. |
| displayName | Flarize Technologies Pvt. Ltd. |
| gstin | `32AAUFG1464A1ZP` |
| companyRegistration | `AAP-6531` |
| address / city / pincode | Thannikakal, Thumpoly PO / Alappuzha / 688008 |
| phone / email / website | 9995073579 / sales@flarize.com / www.flarize.com |

**Entity B — `Golden Ray Renewable Energy LLP`** (baked into Page 8 approved artwork):

| Field | Value |
|---|---|
| account holder | Golden Ray Renewable Energy LLP |
| bank | Union Bank of India |
| A/c No | 510 101 0069 819 30 |
| IFSC | UBIN 0901725 |
| branch | Alappuzha |
| UPI | flarize@upi |

Also `data/users.json` internal emails use `@goldenray.in` (`rajesh@goldenray.in`, `anil@goldenray.in`, `suresh@goldenray.in`) — Golden Ray domain, Golden Ray team.

### Where each string surfaces (source of truth vs artwork)

| Location | String | Type | Authoritative? |
|---|---|---|---|
| `data/company-profile.json` | Flarize Technologies Pvt. Ltd. + `flarize.com` | data | ✅ SoT |
| `data/quotation-state.json` (historical quotations) | same | data (pinned) | ✅ frozen at issue |
| `data/users.json` team emails | `@goldenray.in` | data | ⚠️ contradicts JSON entity |
| `server.js` header comment | `Golden Ray BOM Server` | comment | internal only |
| `public/lib/quotationDocument.js` (old renderer) — `alt="Flarize by Golden Ray"` × 6 sites + `POWERED BY GOLDEN RAY` header (line 1067) + "About Flarize / Flarize by Golden Ray" callout | render string | HARDCODED in renderer (violates C7) |
| **Approved bundle Page 1** (baked JPEG) | Flarize + `sales@flarize.com` + `+91 9995 073 579` + GST `32AAUFC1454A1ZP` + Reg `AAP-6531` | artwork | matches JSON except **GST digit drift** — JSON says `32AAUFG1464A1ZP` (G/6/4) vs bake `32AAUFC1454A1ZP` (C/5/4). One is wrong. |
| **Approved bundle Pages 3, 6, 8, 9, 10, 11, 12** footers (baked JPEG) | Flarize contact strip | artwork | matches JSON |
| **Approved bundle Page 5** footer (baked JPEG) | `www.goldenray.in` / `goldenray@gmail.com` / `+91 6282 922 988` | artwork | **CONFLICT** — different domain, different phone |
| **Approved bundle Page 7** footer (baked JPEG) | Same Golden Ray strip | artwork | **CONFLICT** |
| **Approved bundle Page 8** bank block (baked JPEG) | Golden Ray Renewable Energy LLP + Union Bank account | artwork | **NEW LEGAL ENTITY** — the bank holder is neither Flarize Technologies nor Golden Ray Renewable Energy per JSON |
| **Approved bundle Pages 10, 11** T&C body (baked JPEG) | "Golden Ray Renewable Energy" as warrantor / payee / defendant in jurisdiction clause | artwork | **CONFLICT** — legal terms name Golden Ray, but JSON legalName is Flarize |

### GST number drift — verify

JSON GST `32AAUFG1464A1ZP` — G, 6, 4.
Page 1 baked GST `32AAUFC1454A1ZP` — C, 5, 4.
One is wrong. Real 15-char GSTIN format: state (2) + PAN (10) + entity (1) + Z (1) + check (1). PAN is the middle 10. Difference sits in the PAN: `AUFG146` vs `AUFC145` — different PAN entirely, i.e. different legal entity's GST.

**Decision required from Legal:** which PAN is real. Whichever loses is a data-entry error in either `company-profile.json` or the approved artwork. Approved artwork wins visually today; JSON is what the renderer emits.

### Blocker matrix

| Sub-blocker | Description | Fix path |
|---|---|---|
| `C7_LEGAL_ENTITY_UNRESOLVED` | Two legal entities: Flarize Technologies Pvt. Ltd. (JSON, GST, corporate) vs Golden Ray Renewable Energy LLP (bank holder + T&C warrantor + Pages 5/7 footer). Legal must name the ISSUER of quotations. | Legal decision → then correct `company-profile.json` OR reprint approved artwork to match. |
| `C7_GSTIN_DRIFT` | JSON `32AAUFG1464A1ZP` ≠ artwork `32AAUFC1454A1ZP`. Different PAN. | Verify with CA which PAN belongs to the issuing entity; update the losing side. |
| `C7_FOOTER_MULTI_DOMAIN` | 8 pages baked with `flarize.com`; 2 pages (5, 7) baked with `goldenray.in`. Two different marketing domains active in one document. | Template revision — Pages 5, 7 re-exported with the winning entity's footer. |
| `C7_BANK_ENTITY_LEAKS` | Page 8 bank block names Golden Ray Renewable Energy LLP as payee, then whole document is under Flarize identity. Reader cannot tell who they are paying. | Either declare Golden Ray as the OPERATIONAL entity + Flarize as marketing, and bind bank block to that; or move bank account into Flarize name. |
| `C7_TERMS_ENTITY_LEAKS` | Pages 10, 11 T&C name "Golden Ray Renewable Energy" as warrantor in every clause. | Legal decision + template revision. |
| `C7_RENDERER_HARDCODES` | Old `public/lib/quotationDocument.js` embeds `"Flarize by Golden Ray"` and `"POWERED BY GOLDEN RAY"` at 6+ sites. | Cleared automatically once old renderer is retired at Step 9 cutover — new `approvedTemplate.js` embeds no strings. |
| `C7_TEAM_EMAIL_DOMAIN` | `@goldenray.in` used for team emails; `sales@flarize.com` used for customer contact. | Business decision: legitimate two-brand operation, or unify to one. Not blocking quotation issue; blocks a clean "who to reply to" line for the customer. |

### Options (business/legal decision — not engineering)

- **Option A · Flarize Technologies wins.** Rename bank account holder + T&C warrantor + Pages 5/7 footer + team-email domain to Flarize. Update artwork on Pages 5, 7, 8, 10, 11. Correct JSON GST if it lost the drift check.
- **Option B · Golden Ray Renewable Energy wins.** Rewrite `company-profile.json` with Golden Ray legalName + GST. Update Pages 1, 3, 6, 8, 9, 10, 11, 12 artwork with Golden Ray footer + Golden Ray GST + Golden Ray registration.
- **Option C · Two-entity model.** Flarize = marketing/customer brand. Golden Ray Renewable Energy LLP = operational/legal entity (billing, warranty, bank). New `company-profile.json` fields: `marketingBrand{name,logo,domain}` + `legalEntity{name,gstin,registration,bankBlock}`. Approved template gets separate marketing-footer + legal-block mustaches per page. Largest surface, most honest.

Recommendation: **Option C** if Golden Ray Renewable Energy LLP is the real invoicing entity (bank account + T&C evidence points that way). Legal decides.

---

## Track 2 · Savings `dailySavings`

### Current engine output (`src/lib/savingsEngine.js:191-260`)

Returned fields (positive):
```
systemSizeKw
dailyGenerationUnits, annualOutputKwh
monthlySavingsLow, monthlySavingsHigh        ← range only, no midpoint
annualSavingsAmount                          ← monthlySavings * 12 (midpoint computed locally)
returnPeriodMonths
postSolarBillLow, postSolarBillHigh
currentMonthlyBill
currentBillBreakdown, postSolarBillBreakdown (V2 only)
selfConsumptionModel
assumptions{ … }
```

Currently `null` (config-gated):
```
lifetimeSavingsAmount   ← degradation NOT_APPROVED
tariffEscalationLow/High ← escalation NOT_APPROVED
lifetimeKSEBSpend       ← same
graphPoints             ← same
```

### The gap

`monthlySavings` (point value) is computed inside the engine at line 119, used at line 175 for `annualSavingsAmount = monthlySavings * 12`, but **not emitted in the return object**. Renderer therefore has neither a midpoint monthly figure nor a daily figure. Step 1's `SAVINGS_ENGINE_MISSING_DAILY_FIELD` fires because `payload.savings.value.dailySavings` does not exist.

### Smallest additive extension (READ-ONLY design — do not implement)

`src/lib/savingsEngine.js` — additive fields on the existing return object. No formula change. No config change. Same engine version bumps to `savings.v2` if the team wants to track the addition:

```
monthlySavings:  <midpoint already computed at line 119, currently discarded>
dailySavings:    Math.round(monthlySavings / 30)         // integer ₹/day
```

Both are consequences of numbers already inside the function. No degradation, no escalation, no lifetime assumption crossed.

For per-tier support (Pages 5 mustaches `eliteDaily`, `smartDaily`, `essentialDaily`), the engine is already called per-tier from `quotationWorkspace.resolveSavingsResult` inside `buildAlternativePayloads`. Each tier's snapshot then carries its own `dailySavings`. Zero extra plumbing needed once the field is emitted.

### Consequences

- Clears `SAVINGS_ENGINE_MISSING_DAILY_FIELD` blocker on approved template tokens `dailyValue`, `eliteDaily`, `smartDaily`, `essentialDaily`.
- No new business decision required — `/30` is a customer-facing equivalence, not a financial claim (approved template uses the phrase "daily investment" — the range's midpoint divided by 30 is the honest presentation of the range).
- Does NOT clear `PAGE_8_BAKED_FINANCIALS_AND_BANK` — that page needs `yearlySeries[]`, `lifetime25yrSavings`, `lifetime25yrNetSavings`, `paybackMonths`, all of which require degradation + escalation approval (still `NOT_APPROVED` in `savings-config.json`). Separate gate.

### Files touched by this extension (proposal)

| File | Change |
|---|---|
| `src/lib/savingsEngine.js` | +2 fields on return object. No formula/config change. |
| `tests/savings-engine.test.mjs` (existing) | +1 test: `dailySavings === Math.round(monthlySavings / 30)`; midpoint parity with Low/High range. |
| everything else | untouched |

Not touched: `savings-config.json`, `quotationPayload.js`, `quotationWorkspace.js`, renderer.

---

## Track 3 · KSEB refund (Page 9 "5kw – Rs 4000")

### Where the figure lives today

**Nowhere in code, config, or any engine.** Full sweep:

- `data/subsidy-config.json` — covers PM Surya Ghar CFA only. No KSEB registration fee, no refund formula.
- `src/lib/subsidyEngine.js` — emits `centralSubsidy`, `stateSubsidy`, `totalSubsidy` (all PMSG). Explicitly notes `stateTopUp.kerala = 0`. **Does not model KSEB registration fee refund.**
- No file matches `refund` or `registrationFee`.
- The only hits for "kseb" outside baked artwork:
  - `mockCalculationProviders.js:208-232` — mock monthly generation value at KSEB tariff (Page 3 sample values `5500` / `6600`). Not the registration refund.
- Approved Page 9 JPEG bakes the whole thing: **"REFUND FROM KSEB (80% of Pre-tax value of registration fee) (1000 per kw + 18% tax) 5kw – Rs 4000"**.

Derivation the artwork implies:
```
registrationFeePerKw     = 1000 INR   (pre-tax, KSEB-set)
gstOnFee                 = 18%        (statutory)
refundEligibleFraction   = 80%        (KSEB policy — refund of the pre-tax component after commissioning)

registrationFee(kw)      = kw * registrationFeePerKw * (1 + gstOnFee/100)
                         = kw * 1000 * 1.18  (e.g. 5 kW → ₹5,900)
refund(kw)               = kw * registrationFeePerKw * (refundEligibleFraction/100)
                         = kw * 1000 * 0.80  (e.g. 5 kW → ₹4,000)
```

That matches "5kw – Rs 4000" exactly. Refund is fixed per kW, GST-exclusive.

### Authoritative source options (data / engine surface)

Three places this could legitimately live:

**Option S1 · Extend `data/subsidy-config.json` with a `kseb` section** — smallest, keeps all customer-facing "you-get-back" numbers in one file:

```
"kseb": {
  "registrationFeePerKw": 1000,
  "gstOnFeePct": 18,
  "refundEligibleFractionPct": 80,
  "authority": "KSEB Ltd.",
  "note": "Refund of 80% of the pre-tax registration fee, disbursed by KSEB post-commissioning."
}
```

Then `subsidyEngine.calculateSubsidy` emits (new fields on return):
```
ksebRegistrationFeePerKw: 1000,
ksebRegistrationFeeForSize: kw * 1000 * 1.18,
ksebRefundAmountForSize:   kw * 1000 * (80/100),
```

**Option S2 · New file `data/kseb-config.json` + new tiny module `src/lib/ksebEngine.js`** — cleanest domain separation (KSEB isn't PMSG). One config, one 40-line pure function, one payload section:

```
payload.kseb = {
  available: true, source: 'KSEB_CONFIG',
  value: { registrationFeePerKw, gstOnFeePct, refundEligibleFractionPct,
           registrationFeeForSize, refundAmountForSize }
}
```

Renderer tokens `ksebRefundPerKw`, `ksebRefundForSystemSize` bind to that section.

**Option S3 · Bake into `costEngine` as a NO_MARGIN head** — treat the registration fee as a customer-side cost, refund as an offsetting credit. Rejected: it's not part of the project cost the pricing engine works with; it's a statutory pass-through the customer pays KSEB directly, not part of the quotation total.

### Recommendation

**Option S1.** All customer-facing "you-get-back" money already lives under `payload.subsidy.value.*` (PMSG CFA), so binding the KSEB refund there keeps the mental model coherent. Add one section to config, three fields to engine return. Additive. No formula in renderer. No new module.

### Files touched (proposal)

| File | Change |
|---|---|
| `data/subsidy-config.json` | +`kseb` section (4 fields + note) |
| `src/lib/subsidyEngine.js` | +3 return fields wired from config; blocks with `KSEB_CONFIG_MISSING` if section absent |
| `tests/subsidy-engine.test.mjs` (existing) | +2 tests: refund = kw × ratePerKw × 0.80 for 3 kW, 5 kW, 10 kW; block when config section missing |
| everything else | untouched |

Not touched: `savings-config.json`, `quotationPayload.js`, `quotationWorkspace.js`, renderer, approved HTML.

### Consequences

- Clears `PAGE_9_BAKED_KSEB_REFUND_5KW` when template Rev 2 adds `{{ ksebRefundPerKw }}` and `{{ ksebRefundForSystemSize }}` mustaches.
- Also unlocks Page 9's `bookingFeeAmount` — a separate business decision, not KSEB.

---

## Combined blocker map (post-trace)

| Blocker | Track | Fix owner | Status |
|---|---|---|---|
| `C7_LEGAL_ENTITY_UNRESOLVED` | C7 | Legal | pending |
| `C7_GSTIN_DRIFT` | C7 | CA | pending |
| `C7_FOOTER_MULTI_DOMAIN` (Pages 5, 7) | C7 | Template designer + Legal | pending |
| `C7_BANK_ENTITY_LEAKS` (Page 8) | C7 | Legal | pending |
| `C7_TERMS_ENTITY_LEAKS` (Pages 10, 11) | C7 | Legal | pending |
| `C7_RENDERER_HARDCODES` (old renderer) | C7 | Engineering | auto-clears at Step 9 cutover |
| `C7_TEAM_EMAIL_DOMAIN` | C7 | Business | non-blocking |
| `SAVINGS_ENGINE_MISSING_DAILY_FIELD` | savings | Engineering | one-file additive (§Track 2) |
| `PAGE_9_BAKED_KSEB_REFUND_5KW` | KSEB | Engineering + config | two-file additive (§Track 3) |

---

## HALT

- No production file modified.
- No approved HTML modified.
- No template revised.
- No Malayalam.
- No Page 4.
- Old renderer + new renderer + all engines + all tests untouched.
- Ready for gate decision on Track 2 (dailySavings), Track 3 (KSEB refund), and Track 1 (C7 legal decision).
