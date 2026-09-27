# Energy Engine — Completion Report

Phase 3 Energy Engine implementation per approved business decisions (11 sections).

---

## A. Energy Engine File

**`src/lib/energyEngine.js`** — 372 lines, pure ESM module.

No React, no DOM, no pricing, no subsidy, no GST, no margin, no EMI, no procurement, no finance. Zero dependencies beyond JavaScript builtins.

Exports: `calculateEnergyProfile()`, `unitsToBill()`, `billToUnits()`, `validateEnergyConfig()`, `listRegions()`, `ENERGY_ENGINE_VERSION`, `ENERGY_SOURCE`, `ENERGY_STATUS_LIVE`, `ENERGY_ERROR`.

---

## B. Extracted Logic

Extracted from App.jsx KSEB bill calculator (lines 1443–1590):

- **Forward calculation**: `unitsToBill(biMonthlyUnits, regionConfig)` — KSEB LT-1A telescopic slab rates (≤250 units) and non-telescopic flat rate (>250 units). Returns `{ energyCharge, fixedCharge, duty, meterRent, total, biMonthlyUnits, monthlyUnits }`.
- **Reverse calculation**: `billToUnits(biMonthlyBillAmount, regionConfig)` — binary search (50 iterations) to reverse-engineer bi-monthly units from bill amount.
- **Core profile**: `calculateEnergyProfile(inputs, config, regionId)` — bill → units → consumption → system sizing → generation estimate → surplus.

All arithmetic preserved exactly from App.jsx. No new formulas invented.

---

## C. Tariff Configuration Structure

**`data/energy-config.json`** — external configuration, not hardcoded.

```
config.regions.<regionId>.tariffSlabs[]   — array of { upToUnits, ratePerUnit }
config.regions.<regionId>.nonTelescopicThreshold
config.regions.<regionId>.nonTelescopicRate
config.regions.<regionId>.fixedChargeBiMonthly
config.regions.<regionId>.meterRentBiMonthly
config.regions.<regionId>.electricityDutyPct
config.regions.<regionId>.tariffName
config.regions.<regionId>.tariffVersion
```

Architecture supports future states/DISCOMs via additional region keys. Engine never reads the file — callers load and pass it.

---

## D. Kerala Tariff Values

KSEB LT-1A Domestic (2025–27):

| Slab | Up To (bi-monthly) | Rate (₹/unit) |
|------|---------------------|----------------|
| 1    | 50                  | 3.25           |
| 2    | 100                 | 4.05           |
| 3    | 150                 | 5.10           |
| 4    | 200                 | 6.95           |
| 5    | 250                 | 8.20           |

- Non-telescopic threshold: 250 units (flat ₹8.20 above)
- Fixed charge: ₹80 bi-monthly
- Meter rent: ₹14 bi-monthly
- Electricity duty: 10%

---

## E. Yield Configuration Structure

```
config.regions.<regionId>.yield.dailyGenPerKw   — number (kWh/kW/day)
config.regions.<regionId>.yield.unit            — string
config.regions.<regionId>.yield.source          — string (citation)
```

Missing yield → `BLOCKED` (not silent fallback).

---

## F. Kerala 4.0 Value

```json
"yield": {
  "dailyGenPerKw": 4.0,
  "unit": "kWh/kW/day",
  "source": "Kerala average — KSEB/ANERT reference"
}
```

No other state values invented.

---

## G. System Sizing Rule

- Coverage target: **85%** (exposed as `config.regions.<regionId>.sizing.coverageTarget`)
- Formula: `targetKw = (monthlyUnits / monthlyGenPerKw) × coverageTarget`
- `recommendedKw = Math.ceil(targetKw)`, minimum 1 kW
- Explicit `systemSizeKw` in inputs overrides auto-sizing
- Sizing assumption explicitly surfaced in result: `sizingAssumption.coverageTarget` + `sizingAssumption.note`

---

## H. Commercial Snapshot Interface for Downstream Payback

Energy Engine does NOT calculate payback. Result contains no `paybackYears`, `monthlySavings`, `annualSavings`, `systemPrice`, or `totalCost`.

The result provides what a future Savings Engine needs:
- `monthlyConsumption`, `annualConsumption`
- `averageTariffRate` (₹/kWh)
- `monthlyGeneration`, `annualGeneration`
- `monthlyKsebValueLow`, `monthlyKsebValueHigh`

The actual investment comes from the commercial snapshot, not from hardcoded ₹55,000/kW.

---

## I. Payload Wiring

**`quotationWorkspace.js`** — added `resolveEnergyProfileResult(customer, system, energyConfig)`:
- Extracts `currentBillAmount` and `currentBillCycle` from customer data
- Normalizes billing cycle (handles 'bimonthly', 'bi-monthly', 'bi monthly')
- Passes `systemSizeKw` from system data (override auto-sizing)
- Returns null (not BLOCKED) when no config or no bill amount — payload falls back to BLOCKED dependency

Wired into: `buildPayload()`, `issueQuotation()`, `buildAlternativePayloads()`.

**`quotationPayload.js`** — consumption section changed from always-BLOCKED to conditional:
- When `energyProfileResult.available === true` → populated with live data
- When absent or unavailable → original BLOCKED dependency treatment preserved

**`server-quotation.js`** — loads `data/energy-config.json` at init, passes `energyConfig` to payload and issue endpoints.

---

## J. Snapshot Behavior

- **Draft**: uses current energy config (LIVE calculation on every payload request)
- **Issued**: energy result computed at issuance, frozen into the immutable document
- Future tariff/yield config changes do NOT alter issued quotations
- Verified via API: issued v1 `consumption.available = true`, `frozen: true`, `matchesSnapshot: true`

---

## K. Files Changed

| File | Change |
|------|--------|
| `src/lib/energyEngine.js` | **NEW** — pure calculation module (372 lines) |
| `data/energy-config.json` | **NEW** — Kerala tariff + yield config (43 lines) |
| `tests/energy-engine.test.mjs` | **NEW** — 28 tests covering all 17 approved cases (524 lines) |
| `src/lib/quotationWorkspace.js` | **MODIFIED** — import + `resolveEnergyProfileResult` + wiring in buildPayload/issue/alternatives |
| `src/lib/quotationPayload.js` | **MODIFIED** — consumption section conditional on energyProfileResult |
| `server-quotation.js` | **MODIFIED** — ENERGY_CONFIG load + pass-through to workspace |
| `tests/phase3-quotation-workspace.test.mjs` | **MODIFIED** — import whitelist updated to include energyEngine.js |

---

## L. Files Untouched

- `server-bom-builder.js` — untouched
- `public/lib/quotationDocument.js` — untouched (MD5 `5df115f4e7988b8bc9b2c542eaf5d225` verified)
- `public/quotation-document.html` — untouched
- All artwork/assets — untouched
- Procurement code — untouched
- Sales wizard — untouched
- Quotation numbering — untouched
- Quotation design — untouched
- Catalog (`data/catalog.json`) — untouched
- Pricing engine — untouched

---

## M. Tests

**`tests/energy-engine.test.mjs`** — 28 tests, 28 pass:

1. Kerala KSEB bill → units (forward + reverse)
2. Kerala monthly consumption from bill
3. Annual consumption = monthly × 12
4. Kerala yield = 4.0 kWh/kW/day
5. Generation estimate uses yield × system size
6. System sizing covers ≥85% of consumption
7. Different tariff slabs produce different results
8. Different yield produces different generation
9. Unsupported region returns BLOCKED
10. Config version tracked in result
11. Same inputs produce identical results (determinism)
12. Snapshot immutability — changing config does not affect frozen result
13. Energy result does NOT contain payback
14. Energy Engine source code does not import procurement
15. Energy Engine does not calculate price
16. Energy Engine does not calculate subsidy
17. Energy Engine does not calculate EMI

Additional structural tests: invalid bill BLOCKED, validateEnergyConfig, listRegions, explicit units, source/status tags, payload contract compatibility, missing yield BLOCKED, non-telescopic rate, bimonthly cycle, explicit system size override.

---

## N. Full Regression Tests

**1610 pass / 10 fail** (full suite: `npm test`)

All 10 failures are **pre-existing hybrid battery test failures** — unrelated to the energy engine. These existed before this task began:
- `profile hybrid_value declares one battery`
- `D1 FIXED — hybrid 3/5/8/10kW value is battery-consistent` (4 tests)
- `Issue1: hybrid_value profile exists with battery`
- `Issue1: changing tier changes battery config for hybrid`
- `Issue2: batConfig only applies to hybrid system type`
- `1C hybrid value: quantity comes from the profile (1)`
- `C50 — hybrid Value resolves bt1, is BLOCKED, and is NOT emptied`

One test was legitimately updated: workspace import whitelist (was 11 fail → 10 fail after adding energyEngine.js to allowed imports).

---

## O. Build

`npm run build` — **clean**, no errors:
```
✓ 45 modules transformed
dist/index.html                   0.58 kB
dist/assets/index-BTAjQ7d5.css   34.61 kB
dist/assets/index-BAVKvckM.js   387.16 kB
✓ built in 4.14s
```

---

## P. Browser/API Quotation Verification

Created quotation `energy-test-q1` with:
- Customer bill: ₹3,500/month
- System: 5 kW on-grid, value tier

**Payload result** (GET `/api/quotation/quotations/energy-test-q1/payload`):
```json
{
  "consumption": {
    "available": true,
    "source": "ENERGY_ENGINE",
    "status": "LIVE",
    "value": {
      "monthlyConsumption": 383,
      "annualConsumption": 4596,
      "recommendedSystemSizeKw": 5,
      "exactSystemSizeKw": 3.2,
      "averageTariffRate": 9.14,
      "regionId": "kerala",
      "tariffName": "LT-1A Domestic",
      "tariffVersion": "2025-27"
    }
  }
}
```

**Issued v1** — frozen consumption preserved identically. Immutability verified: `frozen: true`, `matchesSnapshot: true`.

---

## Q. Known Pre-existing Failures

10 hybrid battery tests (listed in section N). These predate this task and are unrelated to energy engine work.

---

## R. Confirmation: No BOM/Procurement/Sales Changes

- `server-bom-builder.js` — **not modified**
- No procurement code touched
- No sales wizard code touched
- Energy Engine source code verified (via comment-stripped scan): no `procurement`, `catalog`, `bomSnapshot`, `quotationPrice`, `totalPrice`, `55000`, `perWatt`, `margin`, `subsidy`, `MNRE`, `78000`, `EMI`, `emi`, `loanAmount`, `interestRate`, `tenure` in executable code
- `quotationDocument.js` MD5 hash unchanged (`5df115f4e7988b8bc9b2c542eaf5d225`)

---

## S. Confirmation: No Renderer Financial Calculations

Energy Engine does NOT calculate:
- Quotation price
- GST
- Subsidy
- Margin
- EMI / loan / finance
- Procurement cost

The renderer (`quotationDocument.js`) was not modified. The payload assembler (`quotationPayload.js`) change is strictly conditional population of the consumption section — no arithmetic added, no financial calculation introduced.

Savings Engine, Subsidy Engine, and Finance Engine are **not implemented** per instruction.
