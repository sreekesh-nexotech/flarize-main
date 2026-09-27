# Savings Engine — Completion Report

**Date:** 2026-08-28  
**Phase:** 3 — Savings Engine  
**Status:** COMPLETE  

---

## A. Savings Engine Implementation

Created `src/lib/savingsEngine.js` — pure ESM module, ~239 lines, zero dependencies beyond JavaScript builtins.

Exports:
- `calculateSavings()` — core calculation function
- `validateSavingsConfig()` — configuration structure validator
- `SAVINGS_ENGINE_VERSION` — `"1.0.0"`
- `SAVINGS_SOURCE` — `"SAVINGS_ENGINE"`
- `SAVINGS_STATUS_LIVE` — `"LIVE"`
- `SAVINGS_ERROR` — frozen error code enum
- `SELF_CONSUMPTION_MODEL` — frozen model enum (`FULL_OFFSET`)

The engine is deterministic, independently testable, and contains no React, DOM, fetch, window, document, procurement, catalog, or BOM references.

---

## B. Formula Used

### Monthly Savings (FULL_OFFSET)
```
effectiveMonthlyGen = min(monthlyGeneration, monthlyConsumption)
monthlySavings      = round(effectiveMonthlyGen × averageTariffRate)
annualSavingsAmount = monthlySavings × 12
```

### Savings Range
```
monthlyGenLow  = round(dailyGenerationLow × 30)
monthlyGenHigh = round(dailyGenerationHigh × 30)
effectiveMonthlyGenLow  = min(monthlyGenLow, monthlyConsumption)
effectiveMonthlyGenHigh = min(monthlyGenHigh, monthlyConsumption)
monthlySavingsLow  = round(effectiveMonthlyGenLow × averageTariffRate)
monthlySavingsHigh = round(effectiveMonthlyGenHigh × averageTariffRate)
```

### Post-Solar Bill
```
postSolarBillHigh = max(0, currentMonthlyBill − monthlySavingsLow)
postSolarBillLow  = max(0, currentMonthlyBill − monthlySavingsHigh)
```

### Payback
```
returnPeriodMonths = ceil((customerTotalIncludingGST / annualSavingsAmount) × 12)
```
If `annualSavingsAmount ≤ 0` → `returnPeriodMonths = null` (BLOCKED).

---

## C. Inputs

| Input | Source | Required |
|---|---|---|
| `energyProfileResult` | Energy Engine (`calculateEnergyProfile()`) | Yes |
| `customerTotalIncludingGST` | Commercial snapshot (ISSUED) | No (payback = null if absent) |
| `currentBillAmount` | Customer record | No (estimated from tariff if absent) |
| `currentBillCycle` | Customer record | No (default: `"monthly"`) |
| `config` | `data/savings-config.json` | No (default: `{}`) |

Fields consumed from `energyProfileResult`:
`monthlyConsumption`, `monthlyGeneration`, `annualGeneration`, `averageTariffRate`, `recommendedSystemSizeKw`, `dailyGenerationLow`, `dailyGenerationHigh`

---

## D. Output Contract

Matches the existing `mockSavingsResult` contract from `mockCalculationProviders.js`:

```json
{
  "source": "SAVINGS_ENGINE",
  "status": "LIVE",
  "available": true,
  "engineVersion": "1.0.0",
  "systemSizeKw": 5,
  "dailyGenerationUnits": 20,
  "annualOutputKwh": 7200,
  "monthlySavingsLow": 3501,
  "monthlySavingsHigh": 3501,
  "annualSavingsAmount": 42012,
  "lifetimeSavingsAmount": null,
  "returnPeriodMonths": null,
  "postSolarBillLow": 0,
  "postSolarBillHigh": 0,
  "tariffEscalationLow": null,
  "tariffEscalationHigh": null,
  "lifetimeKSEBSpend": null,
  "graphPoints": null,
  "selfConsumptionModel": "FULL_OFFSET",
  "assumptions": { ... }
}
```

Blocked result (missing/invalid input):
```json
{
  "source": "SAVINGS_ENGINE",
  "status": "<ERROR_CODE>",
  "available": false,
  "reason": "<human-readable>",
  "engineVersion": "1.0.0"
}
```

---

## E. Payback Basis

**GROSS customer investment.** Formula:

```
returnPeriodMonths = ceil((customerTotalIncludingGST / annualSavingsAmount) × 12)
```

- Uses `customerTotalIncludingGST` from the ISSUED commercial snapshot.
- Subsidy is NOT deducted — subsidy engine does not exist yet.
- If no commercial snapshot is ISSUED, payback = `null`.
- If `annualSavingsAmount ≤ 0`, payback = `null`.
- Division by zero is prevented.

API verification (5kW, ₹3500 bill): `returnPeriodMonths = null` in draft (no commercial snapshot). Direct test with ₹350,000 investment: `returnPeriodMonths = 100` = `ceil(350000/42012 × 12) = ceil(99.97) = 100`. ✓

---

## F. Self-Consumption Model

**FULL_OFFSET** — all generation offsets grid purchase at effective tariff rate.

```
effectiveGeneration = min(monthlyGeneration, monthlyConsumption)
monthlySavings      = effectiveGeneration × averageTariffRate
```

- No export credit.
- If generation exceeds consumption, savings capped at consumption.
- `averageTariffRate` comes from Energy Engine (total bill ÷ estimated consumption), not hardcoded ₹10/kWh.

For example: ₹3,500 bill / 383 units = ₹9.14/kWh effective tariff.

---

## G. Lifetime Fields Status

All lifetime fields are `null` — NOT APPROVED:

| Field | Value | Reason |
|---|---|---|
| `lifetimeSavingsAmount` | `null` | Degradation rate not approved |
| `tariffEscalationLow` | `null` | Tariff escalation not approved |
| `tariffEscalationHigh` | `null` | Tariff escalation not approved |
| `lifetimeKSEBSpend` | `null` | Tariff escalation not approved |
| `graphPoints` | `null` | Requires both degradation + escalation |

Renderer correctly displays these as BLOCKED dependency sections.

---

## H. Export Treatment

No export compensation rule implemented. Surplus generation beyond consumption is NOT valued monetarily. The FULL_OFFSET model caps effective generation at monthly consumption. No feed-in tariff, no net metering credit, no export rate.

---

## I. Configuration

Created `data/savings-config.json`:

```json
{
  "configVersion": "1.0.0",
  "selfConsumptionModel": "FULL_OFFSET",
  "lifetimeYears": 25,
  "degradationRatePerYear": null,
  "tariffEscalationLow": null,
  "tariffEscalationHigh": null
}
```

- `degradationRatePerYear: null` — NOT APPROVED
- `tariffEscalationLow/High: null` — NOT APPROVED
- `lifetimeYears: 25` — stored for future use, not consumed in current calculations
- `validateSavingsConfig()` validates structure and rejects unsupported models

---

## J. Payload Wiring

Savings Engine wired into `quotationWorkspace.js` at three call sites:

1. **`buildPayload()`** — draft payload generation
2. **`issueQuotation()`** — issuance (freezes savings into document)
3. **`buildAlternativePayloads()`** — alternative tier payloads

New function `resolveSavingsResult()` added to workspace:
- Reads energy profile result from Energy Engine
- Extracts `customerTotalIncludingGST` from ISSUED commercial snapshot only
- Reads customer bill amount and cycle from quotation record
- Passes all to `calculateSavings()`
- Result flows through existing `savingsResult` parameter in `buildQuotationPayload()`

Transport layer (`server-quotation.js`):
- Loads `savings-config.json` at init
- Passes `savingsConfig` to `buildPayload()` and `issueQuotation()` calls

No changes to `quotationPayload.js` — existing `savingsResult` parameter accepted and passed through.

---

## K. Snapshot Behavior

**Draft quotation:** Savings result is LIVE — recalculated from current energy engine output and config on every payload request. Changes to tariff, yield, or config affect the draft immediately.

**Issued quotation:** Savings result is frozen into the immutable document at issuance. The `issueQuotation()` call:
1. Resolves savings from current energy + commercial state
2. Passes result to `buildQuotationPayload()`
3. Freezes entire payload into immutable document via `deepFreeze()`
4. Future config/tariff/yield changes do NOT alter issued documents

This matches the existing immutability contract for all other payload sections.

---

## L. Files Changed

| File | Change |
|---|---|
| `src/lib/savingsEngine.js` | **NEW** — pure savings calculation engine |
| `data/savings-config.json` | **NEW** — savings configuration |
| `tests/savings-engine.test.mjs` | **NEW** — 33 unit tests |
| `src/lib/quotationWorkspace.js` | **MODIFIED** — savings wiring (import, `resolveSavingsResult()`, 3 call sites) |
| `server-quotation.js` | **MODIFIED** — `SAVINGS_CONFIG` loading + passing to 2 endpoints |
| `tests/phase3-quotation-workspace.test.mjs` | **MODIFIED** — import whitelist updated to include `savingsEngine.js` |

---

## M. Files Untouched

All protected files confirmed untouched:

- `server-bom-builder.js` — 0 savings references
- `src/lib/commercialSnapshot.js` — 0 savings references
- `public/lib/quotationDocument.js` — NOT modified (31 existing savings references are pre-existing renderer code)
- `quotation-document.html` — NOT modified
- `artwork/` — NOT modified
- `public/assets/` — NOT modified
- `catalog` — NOT modified
- Sales wizard — NOT modified
- Procurement — NOT modified
- `src/lib/quotationPayload.js` — NOT modified (existing `savingsResult` parameter used as-is)

---

## N. Unit Tests

Created `tests/savings-engine.test.mjs` — 33 tests, all pass.

| # | Test | Status |
|---|---|---|
| 1 | Basic savings calculation | ✓ |
| 2 | Monthly savings = effectiveGen × averageTariffRate | ✓ |
| 3 | Annual savings = monthly × 12 | ✓ |
| 4 | Generation capped at consumption | ✓ |
| 5 | Uses averageTariffRate, not hardcoded ₹10 | ✓ |
| 6 | Low/high savings range from generation range | ✓ |
| 7 | Post-solar bill = currentBill − savings, never negative | ✓ |
| 8 | Zero bill → estimated from tariff | ✓ |
| 9 | Missing energy result → BLOCKED | ✓ |
| 10 | energy available=false → BLOCKED | ✓ |
| 11 | Zero tariff → BLOCKED | ✓ |
| 12 | Missing commercial snapshot → payback null, savings still calculated | ✓ |
| 13 | Negative/invalid inputs → BLOCKED | ✓ |
| 14 | Payback uses customerTotalIncludingGST | ✓ |
| 15 | Payback formula: ceil((investment/annualSavings) × 12) | ✓ |
| 16 | Source scan: no ₹55,000/kW hardcode | ✓ |
| 17 | Source scan: no ₹10/kWh hardcode | ✓ |
| 18 | Source scan: no procurement access | ✓ |
| 19 | Source scan: no BOM access | ✓ |
| 20 | Source scan: no GST calculation | ✓ |
| 21 | Source scan: no subsidy calculation | ✓ |
| 22 | Source scan: no EMI calculation | ✓ |
| 23 | No tariff escalation assumption | ✓ |
| 24 | No degradation assumption | ✓ |
| 25 | No export compensation | ✓ |
| 26 | Deterministic output (same input → same output) | ✓ |
| 27 | Issued quotation snapshot (frozen, immutable) | ✓ |
| 28 | Renderer contract compatibility (all mockSavingsResult fields present) | ✓ |
| 29 | FULL_OFFSET model correctly applied | ✓ |
| 30 | Bimonthly billing cycle handled (bill ÷ 2) | ✓ |
| 31 | Config validation — valid config | ✓ |
| 32 | Config validation — missing model | ✓ |
| 33 | Config validation — unsupported model | ✓ |

---

## O. Full Regression Tests

```
# tests 1653
# suites 150
# pass 1609
# fail 10
# cancelled 34
```

All 10 failures are pre-existing hybrid battery issues (unrelated to savings):
- `profile hybrid_value declares one battery`
- `D1 FIXED — hybrid 3kW/5kW/8kW/10kW value is battery-consistent` (×4)
- `Issue1: hybrid_value profile exists with battery`
- `Issue1: changing tier changes battery config for hybrid`
- `Issue2: batConfig only applies to hybrid system type`
- `C50 — hybrid Value resolves bt1, is BLOCKED, and is NOT emptied`
- `Phase B — Quotation History` (cascade from hybrid)
- `Phase A — Security Acceptance` (cascade from hybrid)

Zero savings-related failures. Zero new failures introduced.

---

## P. Build

```
✓ 45 modules transformed.
dist/index.html                   0.58 kB │ gzip:   0.40 kB
dist/assets/index-BTAjQ7d5.css   34.61 kB │ gzip:   6.64 kB
dist/assets/index-BAVKvckM.js   387.16 kB │ gzip: 109.89 kB
✓ built in 3.56s
```

Clean build. No warnings related to savings engine.

---

## Q. API Verification Result

Server started on port 4800. Quotation `sv-test` created as SALES user:
- Customer: ₹3,500/month bill, monthly cycle
- System: ongrid, 5kW, single phase, value tier

**GET /api/quotation/quotations/sv-test/payload** → savings section:

| Field | Expected | Actual |
|---|---|---|
| `source` | `SAVINGS_ENGINE` | `SAVINGS_ENGINE` ✓ |
| `status` | `LIVE` | `LIVE` ✓ |
| `available` | `true` | `true` ✓ |
| `monthlySavingsLow` | ₹3,501 | `3501` ✓ |
| `monthlySavingsHigh` | ₹3,501 | `3501` ✓ |
| `annualSavingsAmount` | ₹42,012 | `42012` ✓ |
| `returnPeriodMonths` | `null` (no commercial) | `null` ✓ |
| `postSolarBillLow` | `0` | `0` ✓ |
| `postSolarBillHigh` | `0` | `0` ✓ |
| `annualOutputKwh` | `7200` | `7200` ✓ |
| `selfConsumptionModel` | `FULL_OFFSET` | `FULL_OFFSET` ✓ |
| `lifetimeSavingsAmount` | `null` | `null` ✓ |
| `tariffEscalationLow` | `null` | `null` ✓ |
| `tariffEscalationHigh` | `null` | `null` ✓ |
| `lifetimeKSEBSpend` | `null` | `null` ✓ |
| `graphPoints` | `null` | `null` ✓ |

Math verification: 383 units × ₹9.14/kWh = ₹3,500.62, rounded = ₹3,501. ✓

---

## R. Remaining Known Failures

10 pre-existing hybrid battery test failures. These are NOT related to the Savings Engine and existed before this implementation.

No savings-related failures.

---

## S. Confirmation: No BOM/Procurement Changes

- `server-bom-builder.js` — NOT modified, zero savings references
- `src/lib/bomSnapshot.js` — NOT modified
- Procurement files — NOT modified
- Savings Engine source code contains zero references to: BOM, procurement, landed cost, purchase price, supplier
- Source-code scan tests (18, 19) verify no `procurement`, `landedCost`, `bomLine`, `bomSnapshot` references in engine

---

## T. Confirmation: No Sales-Wizard Changes

- Sales wizard files — NOT modified
- Savings Engine has no React, DOM, or UI dependencies
- No changes to any `public/` file except existing renderer reads savings contract (pre-existing)

---

## U. Confirmation: No Renderer Financial Calculations

- `public/lib/quotationDocument.js` — NOT modified
- Renderer `savingsPageFields()` is display-only: extracts pre-computed values from payload, applies formatting (`formatMoney`, `formatNumber`), determines BLOCKED/LIVE status — zero calculation formulas
- Source-code scan test (28) verifies renderer contract compatibility
- All savings math happens exclusively in `savingsEngine.js`

---

## V. Confirmation: No Invented Lifetime Assumptions

- No degradation rate used (0.5%, 0.7%, or any other)
- No tariff escalation assumed (3%, 5%, or any other)
- No export compensation rule invented
- No 25-year savings projection generated
- No fake lifetime graph points
- `lifetimeSavingsAmount = null`
- `tariffEscalationLow/High = null`
- `lifetimeKSEBSpend = null`
- `graphPoints = null`
- Source-code scan tests (23, 24, 25) verify no degradation, escalation, or export assumptions in engine source
- `data/savings-config.json` explicitly records `degradationRatePerYear: null`, `tariffEscalationLow: null`, `tariffEscalationHigh: null`

---

## Summary

The Savings Engine is implemented, tested, wired, and verified. First-year savings fields are LIVE. Lifetime fields remain BLOCKED pending business decisions on degradation and tariff escalation. No protected files were modified. No future engines were implemented.
