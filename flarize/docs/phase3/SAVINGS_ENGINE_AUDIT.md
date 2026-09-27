# Savings Engine — Read-Only Audit Report

**Date**: 2026-08-28
**Status**: READ-ONLY AUDIT — No files modified. Awaiting approval before implementation.

---

## A. Existing Savings Logic

**No Savings Engine exists.** The payload section `savings` is permanently BLOCKED with dependency `SAVINGS_ENGINE`:

```
reason: 'No Savings Engine. Generation, savings, payback and long-term figures have no approved formula.'
```

The only savings *calculation* in the codebase is in **App.jsx** (the website/sales-wizard calculator). It is a rough client-side estimate embedded inside a React `useMemo` hook — not a reusable module, not testable in isolation, and uses a REJECTED cost assumption (₹55,000/kW).

A mock provider (`mockSavingsResult`) exists for test purposes only — hardcoded constants, no formulas. It establishes the **de facto field contract** consumed by the renderer.

---

## B. Exact Source Files / Functions

| File | Function/Section | Role |
|------|------------------|------|
| `src/App.jsx` lines 1565–1590 | `useMemo` inside calculator | Client-side rough savings estimate |
| `src/lib/mockCalculationProviders.js` lines 41–91 | `mockSavingsResult()` | TEST-ONLY mock — establishes field contract |
| `src/lib/quotationPayload.js` lines 666–679 | savings section in `buildQuotationPayload()` | Wiring: accepts `savingsResult`, outputs `savings` section |
| `public/lib/quotationDocument.js` lines 1936–2055 | `savingsPageFields()` | Display-only extraction of savings fields from payload |
| `public/lib/quotationDocument.js` lines 2088+ | `renderPage8()` | Display-only: "Your Savings Over Time" page |
| `public/lib/quotationDocument.js` ~line 2549+ | Page 12 investment summary | Display-only: Payback Period, Monthly Savings, 25-Year Net Savings |
| `src/lib/energyEngine.js` lines 240–320 | `calculateEnergyProfile()` result | Upstream: generation, tariff, consumption — inputs for savings |
| `src/lib/commercialSnapshot.js` line 89 | `customerTotalIncludingGST` | Upstream: investment amount for payback |

---

## C. Website Savings Logic

### flarize.com/advanced-calculator
WebFetch returned a landing page — no exposed formulas. The interactive calculator runs client-side JS not visible in the HTML. However, the **App.jsx source** reveals the underlying logic:

```javascript
// src/App.jsx lines 1565–1571
const avgRate = monthlyUnits > 0 ? (breakdown.total / 2) / monthlyUnits : 7;
const genUnits = recommended ? recommended.kw * monthlyGenPerKw : 0;
const effectiveGenUnits = Math.min(genUnits, monthlyUnits);
const monthlySavings = Math.round(effectiveGenUnits * avgRate);
const annualSavings = monthlySavings * 12;
const paybackYears = Math.round((recommended.kw * 55000) / annualSavings * 10) / 10;
```

**Formula**: `monthlySavings = min(generation, consumption) × avgTariffRate`

Key observations:
- `effectiveGenUnits = Math.min(genUnits, monthlyUnits)` — **caps savings at consumption** (can't save more than you consume)
- This is a **100% self-consumption assumption** — all generated units displace grid purchase at retail rate
- No export/net-metering value considered
- `avgRate` = effective tariff (total bill ÷ units), same formula as Energy Engine's `averageTariffRate`
- Payback uses **REJECTED** ₹55,000/kW hardcoded assumption — must use actual `customerTotalIncludingGST` from commercial snapshot

### flarize.com/emi-calculator
Key values found:
- Interest rate: 5.65–5.75% (SBI partnership rate)
- 3kW system cost: ~₹2,00,000
- Subsidy: ₹78,000 (PM Surya Ghar) deducted from principal before EMI
- EMI: ~₹2,500/month post-subsidy
- Monthly electricity offset: ₹3,000 (for 3kW)
- 25-year wealth projection: ₹30 lakh (post-loan reinvestment at 12% SIP)

**These are marketing numbers — NOT authoritative for the Savings Engine.** The EMI calculator is a separate Finance Engine concern.

---

## D. Energy Engine Fields to Consume

The Energy Engine (`energyEngine.js`) already produces everything the Savings Engine needs for the energy side:

| Field | Type | Use in Savings |
|-------|------|----------------|
| `monthlyConsumption` | kWh | Cap savings at consumption |
| `annualConsumption` | kWh | Annual savings calculation |
| `recommendedSystemSizeKw` | kW | System size reference |
| `monthlyGeneration` | kWh | Monthly energy produced |
| `annualGeneration` | kWh | Annual energy produced |
| `averageTariffRate` | ₹/kWh | Effective tariff for savings valuation |
| `dailyGenerationLow` / `High` | kWh | Generation range (±10%) |
| `monthlyKsebValueLow` / `High` | ₹ | Monthly value of generation at tariff |
| `homeUsesUnitsPerDay` | kWh | Daily consumption for self-consumption calc |
| `surplusExportedLow` / `High` | kWh/day | Excess generation beyond consumption |
| `regionId` | string | Region context |
| `tariffName` / `tariffVersion` | string | Tariff traceability |

**No new energy schema needed.** These fields exist and are already wired into the quotation payload's `consumption` and `energyProfile` sections.

---

## E. Commercial Fields to Consume

For payback/ROI, the Savings Engine needs the actual investment amount — NOT ₹55,000/kW.

| Field | Source | Path in Payload |
|-------|--------|-----------------|
| `customerTotalIncludingGST` | `commercialSnapshot.pricing` | `payload.pricing.customer.customerTotalIncludingGST` |

The commercial snapshot is built by `commercialSnapshot.js` and surfaced via `buildPricing()` in the payload assembler. It is ISSUED (frozen) at quotation issuance.

**The Savings Engine must NOT calculate price.** It receives the approved commercial result as an input parameter.

---

## F. Subsidy Interaction

Subsidy is **separate** from savings. Current architecture:

- `subsidyTreatment` field on quotation: `'NOT_QUOTED'` | `'ENGINE_RESULT'`
- Subsidy section built by `buildSubsidySection()` in payload, separate from savings
- `mockSubsidyResult()` returns `subsidyAmount` (e.g. ₹78,000 for PM Surya Ghar)
- Website EMI calculator deducts subsidy from principal before EMI — this is Finance Engine territory

**For payback calculation**, the question is:

```
paybackYears = investment / annualSavings
```

Where `investment` is:
- **Option 1**: `customerTotalIncludingGST` (gross investment — subsidy not deducted)
- **Option 2**: `customerTotalIncludingGST - subsidyAmount` (net investment)

**⚠️ DECISION REQUIRED**: Whether payback uses gross or net investment. App.jsx uses gross (₹55k/kW × kW, no subsidy deduction). The renderer's Page 12 displays "Total Investment" from commercial snapshot (gross). Recommendation: **expose both** — `paybackGrossMonths` and `paybackNetMonths` — and let the renderer pick.

---

## G. Self-Consumption / Export Treatment

**SELF-CONSUMPTION / EXPORT RULE NOT YET DEFINED**

Current state:
- App.jsx uses `effectiveGenUnits = Math.min(genUnits, monthlyUnits)` — this is a **100% self-consumption assumption** (all generation consumed on-site, none exported)
- Energy Engine outputs `surplusExportedLow` / `surplusExportedHigh` — surplus exists in data but **no export value rule** exists
- Net metering appears only as a customer-side expense (₹12,000 in commercial snapshot `customerSideExpenses`) — no savings credit
- No export compensation rate defined anywhere
- No feed-in tariff configuration exists

**Impact**: The App.jsx approach (`min(generation, consumption) × avgRate`) is a **reasonable conservative estimate** for Kerala residential on-grid systems where:
1. Net metering credits offset at retail rate
2. Most residential systems are sized ≤ consumption (85% coverage target)
3. Surplus is small and credited at same rate under KSEB net metering

**Recommendation**: Start with the same `min(generation, consumption)` self-consumption model as App.jsx. Add an explicit `selfConsumptionModel: 'FULL_OFFSET'` tag so future export/net-metering logic can be added without breaking the contract.

---

## H. Degradation Treatment

**NO APPROVED DEGRADATION RULE EXISTS**

- No `degradation` or `degradationRate` field anywhere in config, engine, or tests
- Tests explicitly verify renderer does NOT calculate degradation or lifetime values
- App.jsx does NOT apply degradation — `annualSavings = monthlySavings × 12` (year 1 only)
- Mock provider's `lifetimeSavingsAmount` is hardcoded, not derived from degradation formula
- Mock provider's `graphPoints` use constant annual values (no year-over-year decay)

**Recommendation**: The Savings Engine should initially produce:
- **First-year annual savings** (no degradation applied)
- **Lifetime savings** with a simple 0.5%/year linear degradation assumption (industry standard for Tier-1 panels), tagged as `degradationModel: 'LINEAR_0.5_PCT'`
- The degradation rate should be configurable in `energy-config.json`, not hardcoded

**⚠️ DECISION REQUIRED**: Degradation rate and model. If no decision is made, engine can ship with first-year savings only and `lifetimeSavingsAmount: null` (BLOCKED).

---

## I. ROI / Payback Treatment

App.jsx formula:
```javascript
paybackYears = (kw × 55000) / annualSavings  // REJECTED — uses hardcoded cost
```

Correct formula:
```
paybackYears = customerTotalIncludingGST / annualSavings
```

or with subsidy:
```
paybackNetYears = (customerTotalIncludingGST - subsidyAmount) / annualSavings
```

ROI:
```
roiPercent = ((lifetimeSavings - investment) / investment) × 100
```

The renderer displays:
- **Return Period** in months (`returnPeriodMonths`) — Page 8
- **Payback Period** in months (~N months) — Page 12
- **25-Year Net Savings** — Pages 8 and 12

**Note**: Renderer expects `returnPeriodMonths` (integer months), not `paybackYears` (float). The Savings Engine should output months.

---

## J. Existing Savings Result Contract

No formal `savingsResult` schema exists. The **de facto contract** is established by `mockSavingsResult()`:

```javascript
{
  // Metadata
  source: 'MOCK',           // → 'SAVINGS_ENGINE' for real
  status: 'TEST_ONLY',      // → 'LIVE' for real
  available: true,

  // System reference
  systemSizeKw: 5,

  // Generation
  dailyGenerationUnits: 20,
  annualOutputKwh: 7300,

  // Savings (range)
  monthlySavingsLow: 4000,
  monthlySavingsHigh: 4500,
  annualSavingsAmount: 52000,
  lifetimeSavingsAmount: 1560000,

  // Return period
  returnPeriodMonths: 42,

  // Post-solar bill (range)
  postSolarBillLow: 100,
  postSolarBillHigh: 500,

  // Tariff escalation (range)
  tariffEscalationLow: 3,
  tariffEscalationHigh: 5,

  // Lifetime projections
  lifetimeKSEBSpend: 2400000,

  // Graph time-series (25 years)
  graphPoints: [
    { year: 1, withoutSolarCumulative: 72000, withSolarCumulative: 6000 },
    ...
    { year: 25, withoutSolarCumulative: 1800000, withSolarCumulative: 150000 },
  ]
}
```

**The renderer (`savingsPageFields`) expects exactly these fields.** Any Savings Engine must produce this shape or the renderer breaks.

Fields consumed by renderer:
- `postSolarBillLow/High` → "Post-Solar Monthly Bill"
- `monthlySavingsLow/High` → "Monthly Savings"
- `annualOutputKwh` → "Annual Generation"
- `lifetimeSavingsAmount` → "25-Year Net Savings"
- `returnPeriodMonths` → "Return Period"
- `tariffEscalationLow/High` → "Tariff Escalation"
- `lifetimeKSEBSpend` → "25-Year KSEB Spend"
- `graphPoints[]` → Savings graph

---

## K. Missing Business Decisions

| # | Decision | Impact | Blocking? |
|---|----------|--------|-----------|
| 1 | **Payback basis**: gross investment or net-of-subsidy? | Changes payback by 1–2 years | Yes for payback |
| 2 | **Degradation rate**: 0.5%/year? 0.7%? None? | Changes lifetime savings by 6–9% | Yes for lifetime/25-year figures |
| 3 | **Tariff escalation**: 3–5% per year? Fixed? | Changes lifetime savings significantly | Yes for lifetime/graph |
| 4 | **Self-consumption model**: 100% offset or separate export value? | Minor for ≤85% coverage systems | No — start with 100% offset |
| 5 | **Post-solar bill calculation**: What formula? | Renderer expects `postSolarBillLow/High` | Yes |
| 6 | **Savings range**: Why low/high? Is ±10% generation range the basis? | Renderer expects range, not point | Yes |
| 7 | **lifetimeKSEBSpend**: What is this? 25 years of grid bills without solar? | Renderer displays it | Yes for graph page |

**Minimum viable decisions for Phase 1 Savings Engine**:
- Decision 1: Use **gross** investment initially (matches App.jsx behavior). Add net-of-subsidy as separate field when Subsidy Engine ships.
- Decision 4: Use **100% self-consumption** (matches App.jsx).
- Decisions 2, 3, 5, 6, 7: Can ship with first-year values only. Lifetime/graph fields = null → BLOCKED in renderer until decisions made.

---

## L. Existing Tests

### Tests verifying savings BLOCKED behavior (all pass):

| File | Test | What it verifies |
|------|------|------------------|
| `phase3-quotation-page8.test.mjs` | "lifetime savings blocked with SAVINGS_ENGINE" | Savings blocked when no engine |
| `phase3-quotation-page8.test.mjs` | "return period blocked with SAVINGS_ENGINE" | Return period blocked |
| `phase3-quotation-page8.test.mjs` | "graph data field exists and is blocked on SAVINGS_ENGINE" | Graph blocked |
| `phase3-quotation-page8.test.mjs` | "renderer does not calculate lifetime or annual savings" | No formula in renderer |
| `phase3-quotation-page8.test.mjs` | "renderer does not calculate ROI or payback" | No formula in renderer |
| `phase3-quotation-page8.test.mjs` | "renderer does not calculate subsidy" | Subsidy separate |
| `phase3-quotation-page8.test.mjs` | "renderer does not calculate EMI" | Finance separate |
| `phase3-quotation-page8.test.mjs` | "renderer does not calculate graph points" | No formula in renderer |
| `phase3-quotation-page12.test.mjs` | "payback value comes from payload — renderer contains no payback formula" | No formula in renderer |

### Tests verifying savings DISPLAY with mock data (all pass):

| File | Tests | What they verify |
|------|-------|------------------|
| `phase3-quotation-page8-mock.test.mjs` | 30+ tests | Mock savings renders correctly on Page 8 |
| `phase3-quotation-page8-mock.test.mjs` | Test 16 | "renderer contains no savings formula" |
| `phase3-quotation-page8-mock.test.mjs` | Test 23 | "missing savings becomes BLOCKED" |
| `phase3-quotation-page12.test.mjs` | Multiple | 25-Year Net Savings, Payback Period display |

### Tests verifying payload contract:

| File | Tests | What they verify |
|------|-------|------------------|
| `phase3-quotation.test.mjs` | dependency check | `savings: DEPENDENCY.SAVINGS_ENGINE` |
| `phase3-quotation-workspace.test.mjs` | dependency check | `savings: DEPENDENCY.SAVINGS_ENGINE` |
| `phase3-quotation-transport.test.mjs` | transport check | `savings.dependency === 'SAVINGS_ENGINE'` |

---

## M. Missing Tests

| # | Test needed | Why |
|---|-------------|-----|
| 1 | `savingsEngine.test.mjs` — full unit tests | Engine doesn't exist yet |
| 2 | Savings + Energy Engine integration | Verify savings consumes energy result correctly |
| 3 | Savings + Commercial Snapshot integration | Verify payback uses actual `customerTotalIncludingGST` |
| 4 | Savings result frozen on issuance | Like energy engine: draft = LIVE, issued = frozen |
| 5 | Savings Engine source code scan | No procurement/BOM/margin/price/GST in savings code |
| 6 | Savings Engine does NOT calculate subsidy/EMI | Boundary tests |
| 7 | Edge cases: zero bill, zero generation, missing energy result | Error handling |

---

## N. Minimum Implementation Plan

### OPTION C — NEW SAVINGS ENGINE REQUIRED

No reusable savings engine exists. App.jsx formula is embedded in a React `useMemo`, uses a REJECTED cost assumption, and cannot be imported. The mock provider has no formulas. A new `savingsEngine.js` module is required.

### Minimum implementation:

1. **Create `src/lib/savingsEngine.js`** — pure ESM module, same pattern as `energyEngine.js`:
   - Input: `energyProfileResult` + `customerTotalIncludingGST` + optional `subsidyAmount`
   - Core formula: `monthlySavings = min(monthlyGeneration, monthlyConsumption) × averageTariffRate`
   - Savings range from generation range (±10% already in energy result)
   - `returnPeriodMonths = Math.ceil((investment / annualSavings) × 12)`
   - `postSolarBill = currentBill - monthlySavings`
   - Post-solar bill range from savings range
   - First-year values only (no degradation/escalation until decided)
   - Lifetime/graph = null until degradation + escalation decisions made
   - Output matches `mockSavingsResult` contract shape

2. **Create `data/savings-config.json`** (or extend `energy-config.json`):
   - `selfConsumptionModel: 'FULL_OFFSET'`
   - `degradationRatePerYear: null` (not yet decided)
   - `tariffEscalationRange: null` (not yet decided)
   - `lifetimeYears: 25`

3. **Wire into `quotationWorkspace.js`**:
   - Import `calculateSavings` from savingsEngine
   - Call with energy result + commercial snapshot
   - Pass `savingsResult` to `buildQuotationPayload()` instead of `null`

4. **Wire into `server-quotation.js`**:
   - Pass savings config alongside energy config

5. **Create `tests/savings-engine.test.mjs`**:
   - All unit tests + boundary tests + integration tests
   - Source code scan (no BOM/procurement/margin/price/GST)
   - Verify output contract matches renderer expectations

---

## O. Exact Files That Would Need Modification

| File | Change |
|------|--------|
| `src/lib/savingsEngine.js` | **NEW** — pure calculation module |
| `data/savings-config.json` | **NEW** — savings configuration (or extend energy-config.json) |
| `tests/savings-engine.test.mjs` | **NEW** — comprehensive test suite |
| `src/lib/quotationWorkspace.js` | **MODIFIED** — import + call savingsEngine, pass result to payload |
| `server-quotation.js` | **MODIFIED** — load savings config, pass to workspace |
| `tests/phase3-quotation-workspace.test.mjs` | **MODIFIED** — import whitelist update |

### Files NOT modified:
- `src/lib/quotationPayload.js` — already wired (`savingsResult` param exists, savings section built)
- `public/lib/quotationDocument.js` — display-only, already handles both available and BLOCKED
- `src/lib/energyEngine.js` — LOCKED
- `src/lib/commercialSnapshot.js` — untouched
- `server-bom-builder.js` — untouched
- All procurement/sales/BOM code — untouched

---

## Decision: OPTION C — NEW SAVINGS ENGINE REQUIRED

**Rationale**:
- **Option A rejected**: No reusable savings engine exists
- **Option B rejected**: App.jsx logic is embedded in React hooks with a REJECTED cost assumption (₹55,000/kW) — it cannot be extracted/adapted without rewriting
- **Option C**: A new pure module following the Energy Engine pattern — pure ESM, no React, no DOM, no pricing, testable in isolation, matching the existing `mockSavingsResult` contract

**ABSOLUTE STOP. READ-ONLY AUDIT COMPLETE. No files modified. Awaiting approval.**
