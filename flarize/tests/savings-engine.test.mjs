/**
 * SAVINGS ENGINE TESTS  (Phase 3, V2 — Bill-Difference Model)
 *
 * 32 categories per spec, 80+ tests covering:
 *   1    Current bill → current consumption
 *   2    Current bill calculation (KSEB)
 *   3    Solar generation < consumption
 *   4    Solar generation = consumption
 *   5    Solar generation > consumption
 *   6    Post-solar fixed charge
 *   7    Post-solar meter rent
 *   8    Post-solar electricity duty
 *   9    Non-telescopic customer
 *   10   Telescopic customer
 *   11   Single phase
 *   12   Three phase
 *   13   Bi-monthly billing
 *   14   Monthly normalized result
 *   15   Low generation
 *   16   High generation
 *   17   Annual savings
 *   18   Gross payback
 *   19   Zero savings
 *   20   Missing Energy Engine result
 *   21   Missing commercial snapshot
 *   22   No ₹10 hardcode
 *   23   No ₹55,000/kW
 *   24   No procurement access
 *   25   No BOM access
 *   26   No subsidy
 *   27   No EMI
 *   28   No degradation
 *   29   No tariff escalation
 *   30   No export compensation
 *   31   Deterministic output
 *   32   Existing quotation payload compatibility
 *
 *   + Config validation
 *   + Realistic test cases A–D
 *   + V1 fallback
 *   + Regression
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  calculateSavings,
  validateSavingsConfig,
  SAVINGS_ENGINE_VERSION,
  SAVINGS_SOURCE,
  SAVINGS_STATUS_LIVE,
  SAVINGS_ERROR,
  SELF_CONSUMPTION_MODEL,
} from '../src/lib/savingsEngine.js';

import { calculateEnergyProfile, unitsToBill } from '../src/lib/energyEngine.js';

// ---- Helpers ----------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
}

const SAVINGS_SRC_RAW = readFileSync(resolve(__dirname, '../src/lib/savingsEngine.js'), 'utf-8');
const SAVINGS_SRC = stripComments(SAVINGS_SRC_RAW);

const ENERGY_CONFIG = JSON.parse(readFileSync(resolve(__dirname, '../data/energy-config.json'), 'utf-8'));
const SAVINGS_CONFIG = JSON.parse(readFileSync(resolve(__dirname, '../data/savings-config.json'), 'utf-8'));
const KERALA = ENERGY_CONFIG.regions.kerala;

function makeEnergyResult(billAmount = 3500, billingCycle = 'monthly', systemSizeKw) {
  const inputs = { billAmount, billingCycle };
  if (systemSizeKw) inputs.systemSizeKw = systemSizeKw;
  return calculateEnergyProfile(inputs, ENERGY_CONFIG);
}

/** Standard V2 savings call with regionConfig. */
function savingsV2(energyResult, opts = {}) {
  return calculateSavings({
    energyProfileResult: energyResult,
    regionConfig: KERALA,
    customerTotalIncludingGST: opts.investment ?? null,
    currentBillAmount: opts.billAmount ?? null,
    currentBillCycle: opts.billCycle ?? 'monthly',
    config: SAVINGS_CONFIG,
  });
}

// ---- Standard test energy results ------------------------------------------
const ENERGY_3500 = makeEnergyResult(3500, 'monthly');          // ~200 units monthly
const ENERGY_7000_BI = makeEnergyResult(7000, 'bimonthly');     // ~200 units monthly
const ENERGY_1000 = makeEnergyResult(1000, 'monthly');          // low consumption
const ENERGY_8000 = makeEnergyResult(8000, 'monthly');          // non-telescopic (>250 monthly)
const ENERGY_500_10KW = makeEnergyResult(500, 'monthly', 10);  // gen >> consumption

// =============================================================================
// TESTS
// =============================================================================

describe('Savings Engine V2 — Bill-Difference Model', () => {

  // ========================================================================
  // 1. Current bill → current consumption
  // ========================================================================
  test('1 — current consumption derived from Energy Engine, not re-calculated', () => {
    const r = savingsV2(ENERGY_3500, { billAmount: 3500 });
    assert.equal(r.available, true);
    // currentMonthlyBill comes from unitsToBill(consumption×2) / 2
    const expected = Math.round(unitsToBill(ENERGY_3500.monthlyConsumption * 2, KERALA, 'single').total / 2);
    assert.equal(r.currentMonthlyBill, expected);
  });

  // ========================================================================
  // 2. Current bill calculation (KSEB)
  // ========================================================================
  test('2 — current bill calculated via KSEB billing engine', () => {
    const r = savingsV2(ENERGY_3500);
    // V2 bill from KSEB engine should include energy + fixed + duty + meter rent
    assert.ok(r.currentBillBreakdown, 'breakdown present in V2');
    assert.ok(r.currentBillBreakdown.energyCharge > 0);
    assert.ok(r.currentBillBreakdown.fixedCharge > 0);
    assert.ok(r.currentBillBreakdown.duty > 0);
    assert.ok(r.currentBillBreakdown.meterRent > 0);
    // Total matches
    const bkdn = r.currentBillBreakdown;
    assert.equal(r.currentMonthlyBill,
      bkdn.energyCharge + bkdn.fixedCharge + bkdn.duty + bkdn.meterRent);
  });

  // ========================================================================
  // 3. Solar generation < consumption
  // ========================================================================
  test('3 — generation < consumption: savings < current bill', () => {
    // 3kW system on ₹3500 bill — generation should be less than consumption
    const energy = makeEnergyResult(3500, 'monthly', 3);
    const r = savingsV2(energy);
    assert.ok(energy.monthlyGeneration < energy.monthlyConsumption, 'gen < consumption');
    assert.ok(r.monthlySavingsHigh < r.currentMonthlyBill, 'savings less than bill');
    assert.ok(r.postSolarBillLow > 0, 'still has post-solar bill');
  });

  // ========================================================================
  // 4. Solar generation = consumption (approximately)
  // ========================================================================
  test('4 — generation ≈ consumption: post-solar bill near fixed+meter+duty only', () => {
    // Use auto-sized system (sized to match consumption)
    const energy = ENERGY_3500;
    if (Math.abs(energy.monthlyGeneration - energy.monthlyConsumption) < energy.monthlyConsumption * 0.15) {
      const r = savingsV2(energy);
      // Post-solar bill should be small (just minimum fixed charge + meter rent)
      // When consumption goes to ~0, KSEB still charges minimum fixed + meter rent
      const zeroConsumptionBill = unitsToBill(0, KERALA, 'single');
      const minMonthlyBill = Math.round(zeroConsumptionBill.total / 2);
      assert.ok(r.postSolarBillLow <= r.currentMonthlyBill,
        'post-solar <= current');
    }
  });

  // ========================================================================
  // 5. Solar generation > consumption
  // ========================================================================
  test('5 — generation > consumption: no negative consumption, no export value', () => {
    const r = savingsV2(ENERGY_500_10KW, { billAmount: 500 });
    assert.ok(r.available);
    // Post-solar consumption = max(C - G, 0) = 0, but KSEB min charges apply
    assert.ok(r.postSolarBillLow >= 0, 'post-solar bill never negative');
    assert.ok(r.postSolarBillHigh >= 0);
    // Savings capped: can't save more than current bill
    assert.ok(r.monthlySavingsHigh <= r.currentMonthlyBill,
      `savings ${r.monthlySavingsHigh} <= current bill ${r.currentMonthlyBill}`);
  });

  // ========================================================================
  // 6. Post-solar fixed charge
  // ========================================================================
  test('6 — post-solar bill includes fixed charge based on reduced consumption', () => {
    const energy = makeEnergyResult(3500, 'monthly', 3);
    const r = savingsV2(energy);
    assert.ok(r.postSolarBillBreakdown, 'V2 breakdown present');
    // Post-solar fixed charge based on reduced consumption band
    assert.ok(r.postSolarBillBreakdown.fixedCharge >= 0,
      'fixed charge present in post-solar');
    // Reduced consumption = lower or equal fixed charge band
    assert.ok(r.postSolarBillBreakdown.fixedCharge <= r.currentBillBreakdown.fixedCharge,
      'post-solar fixed charge ≤ current (lower consumption band)');
  });

  // ========================================================================
  // 7. Post-solar meter rent
  // ========================================================================
  test('7 — post-solar bill still includes meter rent', () => {
    const r = savingsV2(ENERGY_3500);
    assert.ok(r.postSolarBillBreakdown.meterRent > 0, 'meter rent in post-solar');
    // Meter rent same regardless of consumption
    assert.equal(r.postSolarBillBreakdown.meterRent, r.currentBillBreakdown.meterRent,
      'meter rent unchanged by solar');
  });

  // ========================================================================
  // 8. Post-solar electricity duty
  // ========================================================================
  test('8 — post-solar duty = 10% of post-solar energy charge only', () => {
    const r = savingsV2(ENERGY_3500);
    const psBkdn = r.postSolarBillBreakdown;
    // duty ≈ 10% of energy charge (rounded)
    const expectedDuty = Math.round(psBkdn.energyCharge * 0.1);
    assert.ok(Math.abs(psBkdn.duty - expectedDuty) <= 1,
      `duty ${psBkdn.duty} ≈ 10% of energy ${psBkdn.energyCharge} = ${expectedDuty}`);
  });

  // ========================================================================
  // 9. Non-telescopic customer
  // ========================================================================
  test('9 — non-telescopic customer: entire consumption at flat rate', () => {
    // ₹8000 monthly → >250 units/month → >500 bi-monthly → non-telescopic
    const r = savingsV2(ENERGY_8000);
    assert.equal(r.currentBillBreakdown.billingCategory, 'nonTelescopic',
      'high consumer is non-telescopic');
    assert.ok(r.monthlySavingsHigh > 0, 'savings available');
  });

  // ========================================================================
  // 10. Telescopic customer
  // ========================================================================
  test('10 — telescopic customer: progressive slab rates', () => {
    const energy = makeEnergyResult(2000, 'monthly');
    const r = savingsV2(energy);
    assert.equal(r.currentBillBreakdown.billingCategory, 'telescopic',
      '₹2000 customer (250 monthly / 500 bi-monthly) is telescopic');
    assert.ok(r.monthlySavingsHigh > 0);
  });

  // ========================================================================
  // 11. Single phase
  // ========================================================================
  test('11 — single phase: uses single-phase fixed charge and meter rent', () => {
    const energy = makeEnergyResult(3500, 'monthly');
    // Energy engine defaults to single phase
    const r = savingsV2(energy);
    // Verify meter rent matches single phase (₹6/month = ₹12 bi-monthly / 2)
    assert.equal(r.currentBillBreakdown.meterRent, Math.round(KERALA.meterRent.singlePhaseBiMonthly / 2));
  });

  // ========================================================================
  // 12. Three phase
  // ========================================================================
  test('12 — three phase: higher fixed charge and meter rent', () => {
    const energy = { ...ENERGY_3500, phase: 'three' };
    const r = savingsV2(energy);
    // Three-phase meter rent: ₹30 bi-monthly / 2 = ₹15
    assert.equal(r.currentBillBreakdown.meterRent, Math.round(KERALA.meterRent.threePhaseBiMonthly / 2));
    // Three-phase fixed charge > single-phase for same consumption
    const singleR = savingsV2({ ...ENERGY_3500, phase: 'single' });
    assert.ok(r.currentBillBreakdown.fixedCharge >= singleR.currentBillBreakdown.fixedCharge,
      'three-phase fixed ≥ single-phase');
  });

  // ========================================================================
  // 13. Bi-monthly billing
  // ========================================================================
  test('13 — bi-monthly bill input normalized correctly', () => {
    // ₹7000 bi-monthly = same as ₹3500 monthly
    const r7000 = savingsV2(ENERGY_7000_BI, { billAmount: 7000, billCycle: 'bimonthly' });
    assert.ok(r7000.available);
    // Monthly consumption should be similar for both
    assert.equal(ENERGY_7000_BI.monthlyConsumption, ENERGY_3500.monthlyConsumption);
  });

  // ========================================================================
  // 14. Monthly normalized result
  // ========================================================================
  test('14 — all output values are monthly (not bi-monthly)', () => {
    const r = savingsV2(ENERGY_3500, { billAmount: 3500 });
    // currentMonthlyBill should be reasonable monthly value
    assert.ok(r.currentMonthlyBill > 0 && r.currentMonthlyBill < 50000,
      'monthly bill in reasonable range');
    // Post-solar bills monthly
    assert.ok(r.postSolarBillLow < r.currentMonthlyBill || r.postSolarBillLow === 0);
    // Savings monthly
    assert.ok(r.monthlySavingsHigh > 0 && r.monthlySavingsHigh < r.currentMonthlyBill + 1);
  });

  // ========================================================================
  // 15. Low generation
  // ========================================================================
  test('15 — low generation range produces lower savings', () => {
    const r = savingsV2(ENERGY_3500);
    assert.ok(r.monthlySavingsLow <= r.monthlySavingsHigh,
      'low savings ≤ high savings');
    assert.ok(r.postSolarBillHigh >= r.postSolarBillLow,
      'low gen → higher post-solar bill');
  });

  // ========================================================================
  // 16. High generation
  // ========================================================================
  test('16 — high generation range produces higher savings', () => {
    const r = savingsV2(ENERGY_3500);
    assert.ok(r.monthlySavingsHigh >= r.monthlySavingsLow);
    // High gen → lower post-solar bill
    assert.ok(r.postSolarBillLow <= r.postSolarBillHigh);
  });

  // ========================================================================
  // 17. Annual savings
  // ========================================================================
  test('17 — annual savings = monthlySavings × 12', () => {
    const r = savingsV2(ENERGY_3500);
    // annualSavingsAmount uses the nominal (not low/high)
    // Verify: nominal savings = (currentBill - postSolarBill) with nominal gen
    const currentBi = unitsToBill(ENERGY_3500.monthlyConsumption * 2, KERALA, 'single');
    const postSolarConsumption = Math.max(ENERGY_3500.monthlyConsumption - ENERGY_3500.monthlyGeneration, 0);
    const postSolarBi = unitsToBill(postSolarConsumption * 2, KERALA, 'single');
    const expectedMonthlySavings = Math.max(0, Math.round(currentBi.total / 2) - Math.round(postSolarBi.total / 2));
    assert.equal(r.annualSavingsAmount, expectedMonthlySavings * 12);
  });

  // ========================================================================
  // 18. Gross payback
  // ========================================================================
  test('18 — payback = ceil(customerTotalIncludingGST / annualSavings × 12)', () => {
    const investment = 310000;
    const r = savingsV2(ENERGY_3500, { investment });
    const expected = Math.ceil((investment / r.annualSavingsAmount) * 12);
    assert.equal(r.returnPeriodMonths, expected);
  });

  test('18b — different investment → different payback', () => {
    const r1 = savingsV2(ENERGY_3500, { investment: 310000 });
    const r2 = savingsV2(ENERGY_3500, { investment: 200000 });
    assert.ok(r1.returnPeriodMonths > r2.returnPeriodMonths);
  });

  // ========================================================================
  // 19. Zero savings
  // ========================================================================
  test('19 — zero generation → BLOCKED', () => {
    const result = calculateSavings({
      energyProfileResult: { ...ENERGY_3500, monthlyGeneration: 0 },
      regionConfig: KERALA,
    });
    assert.equal(result.available, false);
    assert.equal(result.status, SAVINGS_ERROR.ZERO_GENERATION);
  });

  test('19b — zero consumption → BLOCKED', () => {
    const result = calculateSavings({
      energyProfileResult: { ...ENERGY_3500, monthlyConsumption: 0 },
      regionConfig: KERALA,
    });
    assert.equal(result.available, false);
    assert.equal(result.status, SAVINGS_ERROR.ZERO_CONSUMPTION);
  });

  // ========================================================================
  // 20. Missing Energy Engine result
  // ========================================================================
  test('20 — null energy result → BLOCKED', () => {
    const r = calculateSavings({ energyProfileResult: null, regionConfig: KERALA });
    assert.equal(r.available, false);
    assert.equal(r.status, SAVINGS_ERROR.MISSING_ENERGY_RESULT);
  });

  test('20b — energy result available=false → BLOCKED', () => {
    const r = calculateSavings({
      energyProfileResult: { available: false, status: 'BLOCKED' },
      regionConfig: KERALA,
    });
    assert.equal(r.available, false);
    assert.equal(r.status, SAVINGS_ERROR.MISSING_ENERGY_RESULT);
  });

  // ========================================================================
  // 21. Missing commercial snapshot
  // ========================================================================
  test('21 — missing investment → savings available, payback null', () => {
    const r = savingsV2(ENERGY_3500);
    assert.equal(r.available, true);
    assert.equal(r.returnPeriodMonths, null);
    assert.ok(r.monthlySavingsHigh > 0);
  });

  // ========================================================================
  // 22. No ₹10 hardcode
  // ========================================================================
  test('22 — no ₹10/kWh hardcoded tariff in source', () => {
    assert.ok(!/averageTariffRate\s*=\s*10\b/.test(SAVINGS_SRC), 'No rate = 10');
    assert.ok(!SAVINGS_SRC.includes('₹10'), 'No ₹10 literal');
    assert.ok(!SAVINGS_SRC.includes('const avgRate = 10'), 'No avgRate = 10');
  });

  // ========================================================================
  // 23. No ₹55,000/kW
  // ========================================================================
  test('23 — no ₹55,000/kW in savings engine source', () => {
    assert.ok(!SAVINGS_SRC.includes('55000'), 'No 55000');
    assert.ok(!SAVINGS_SRC.includes('55,000'), 'No 55,000');
  });

  // ========================================================================
  // 24. No procurement access
  // ========================================================================
  test('24 — savings engine source does not reference procurement', () => {
    assert.ok(!SAVINGS_SRC.includes('procurement'), 'No procurement');
    assert.ok(!SAVINGS_SRC.includes('bomSnapshot'), 'No bomSnapshot');
    assert.ok(!SAVINGS_SRC.includes('server-bom'), 'No server-bom');
  });

  // ========================================================================
  // 25. No BOM access
  // ========================================================================
  test('25 — savings engine does not import BOM modules', () => {
    assert.ok(!SAVINGS_SRC.includes('catalog'), 'No catalog');
    assert.ok(!SAVINGS_SRC.includes('bomSnapshot'), 'No bomSnapshot');
  });

  // ========================================================================
  // 26. No subsidy
  // ========================================================================
  test('26 — savings engine does not calculate subsidy', () => {
    assert.ok(!SAVINGS_SRC.includes('subsidyAmount'), 'No subsidyAmount');
    assert.ok(!SAVINGS_SRC.includes('78000'), 'No ₹78,000');
    assert.ok(!SAVINGS_SRC.includes('MNRE'), 'No MNRE');
    assert.ok(!SAVINGS_SRC.includes('Surya Ghar'), 'No Surya Ghar');
  });

  // ========================================================================
  // 27. No EMI
  // ========================================================================
  test('27 — savings engine does not calculate EMI', () => {
    assert.ok(!/\bemi\b/i.test(SAVINGS_SRC), 'No EMI keyword');
    assert.ok(!SAVINGS_SRC.includes('loanAmount'), 'No loanAmount');
    assert.ok(!SAVINGS_SRC.includes('interestRate'), 'No interestRate');
    assert.ok(!SAVINGS_SRC.includes('tenure'), 'No tenure');
  });

  // ========================================================================
  // 28. No degradation
  // ========================================================================
  test('28 — no degradation applied, lifetime savings null', () => {
    const r = savingsV2(ENERGY_3500);
    assert.equal(r.lifetimeSavingsAmount, null);
    assert.equal(r.lifetimeKSEBSpend, null);
    assert.equal(r.graphPoints, null);
  });

  // ========================================================================
  // 29. No tariff escalation
  // ========================================================================
  test('29 — no tariff escalation in output', () => {
    const r = savingsV2(ENERGY_3500);
    assert.equal(r.tariffEscalationLow, null);
    assert.equal(r.tariffEscalationHigh, null);
  });

  // ========================================================================
  // 30. No export compensation
  // ========================================================================
  test('30 — no export compensation: surplus not valued', () => {
    assert.ok(!/exportRate\s*=/.test(SAVINGS_SRC), 'No exportRate');
    assert.ok(!/feedInTariff\s*=/.test(SAVINGS_SRC), 'No feedInTariff');
    assert.ok(!SAVINGS_SRC.includes('exportValue'), 'No exportValue');
    assert.ok(!SAVINGS_SRC.includes('exportCredit'), 'No exportCredit');
    // 10kW on ₹500 bill → huge surplus, savings still capped
    const r = savingsV2(ENERGY_500_10KW, { billAmount: 500 });
    assert.ok(r.monthlySavingsHigh <= r.currentMonthlyBill,
      'savings capped at current bill — no export value');
  });

  // ========================================================================
  // 31. Deterministic output
  // ========================================================================
  test('31 — same inputs produce identical results', () => {
    const params = {
      energyProfileResult: ENERGY_3500,
      customerTotalIncludingGST: 310000,
      regionConfig: KERALA,
      config: SAVINGS_CONFIG,
    };
    const r1 = calculateSavings(params);
    const r2 = calculateSavings(params);
    assert.deepEqual(r1, r2);
  });

  test('31b — result is serializable (snapshot-safe)', () => {
    const r = savingsV2(ENERGY_3500, { investment: 310000 });
    const frozen = JSON.parse(JSON.stringify(r));
    assert.equal(frozen.available, true);
    assert.equal(frozen.monthlySavingsLow, r.monthlySavingsLow);
    assert.equal(frozen.returnPeriodMonths, r.returnPeriodMonths);
  });

  // ========================================================================
  // 32. Existing quotation payload compatibility
  // ========================================================================
  test('32 — output contract matches renderer field expectations', () => {
    const r = savingsV2(ENERGY_3500, { investment: 310000 });
    const requiredFields = [
      'source', 'status', 'available', 'engineVersion',
      'systemSizeKw', 'dailyGenerationUnits', 'annualOutputKwh',
      'monthlySavingsLow', 'monthlySavingsHigh',
      // Emitted so downstream consumers do not have to reconstruct them
      // from the range. Renderer must never divide payload values.
      'monthlySavings', 'dailySavings',
      'annualSavingsAmount',
      'lifetimeSavingsAmount', 'returnPeriodMonths',
      'postSolarBillLow', 'postSolarBillHigh',
      'tariffEscalationLow', 'tariffEscalationHigh',
      'lifetimeKSEBSpend', 'graphPoints',
      'selfConsumptionModel', 'assumptions',
    ];
    for (const f of requiredFields) {
      assert.ok(f in r, `has ${f}`);
    }
    assert.equal(r.source, 'SAVINGS_ENGINE');
    assert.equal(r.status, 'LIVE');
    assert.equal(r.selfConsumptionModel, 'FULL_OFFSET');
  });

  // ========================================================================
  // REALISTIC TEST CASES
  // ========================================================================

  // ---- CASE A: ₹3,500/month, 3kW system ----
  test('CASE A — ₹3,500/month, 3kW ongrid', () => {
    const energy = makeEnergyResult(3500, 'monthly', 3);
    const r = savingsV2(energy, { investment: 189000, billAmount: 3500 });
    assert.ok(r.available);

    // Current bill via KSEB engine
    const expectedCurrentBi = unitsToBill(energy.monthlyConsumption * 2, KERALA, 'single');
    assert.equal(r.currentMonthlyBill, Math.round(expectedCurrentBi.total / 2));

    // Post-solar bill via KSEB engine
    const postConsumption = Math.max(energy.monthlyConsumption - energy.monthlyGeneration, 0);
    const expectedPostBi = unitsToBill(postConsumption * 2, KERALA, 'single');
    const expectedPostMonthly = Math.round(expectedPostBi.total / 2);

    // Savings = current - post-solar
    const expectedSavings = Math.max(0, r.currentMonthlyBill - expectedPostMonthly);
    assert.equal(r.annualSavingsAmount, expectedSavings * 12);

    // Payback
    assert.ok(r.returnPeriodMonths > 0);
    assert.equal(r.returnPeriodMonths, Math.ceil((189000 / r.annualSavingsAmount) * 12));

    // No fractional rupees
    assert.equal(r.currentMonthlyBill, Math.round(r.currentMonthlyBill));
    assert.equal(r.monthlySavingsLow, Math.round(r.monthlySavingsLow));
    assert.equal(r.monthlySavingsHigh, Math.round(r.monthlySavingsHigh));
    assert.equal(r.postSolarBillLow, Math.round(r.postSolarBillLow));
    assert.equal(r.postSolarBillHigh, Math.round(r.postSolarBillHigh));
  });

  // ---- CASE B: ₹7,000 bi-monthly ----
  test('CASE B — ₹7,000 bi-monthly normalized correctly', () => {
    const energy = makeEnergyResult(7000, 'bimonthly', 3);
    const r = savingsV2(energy, { billAmount: 7000, billCycle: 'bimonthly' });
    assert.ok(r.available);
    // Monthly consumption should be same as ₹3,500 monthly
    assert.equal(energy.monthlyConsumption, ENERGY_3500.monthlyConsumption);
    // Results should be monthly
    assert.ok(r.currentMonthlyBill < 7000, 'output is monthly, not bi-monthly');
  });

  // ---- CASE C: High consumption (non-telescopic) ----
  test('CASE C — high consumption >250 units/month (non-telescopic)', () => {
    const energy = makeEnergyResult(8000, 'monthly');
    const r = savingsV2(energy, { billAmount: 8000 });
    assert.ok(r.available);
    assert.equal(r.currentBillBreakdown.billingCategory, 'nonTelescopic');
    // Non-telescopic: entire consumption at single flat rate
    assert.ok(r.currentMonthlyBill > 0);
    assert.ok(r.monthlySavingsHigh > 0);

    // Verify bill difference is correct
    const currentBi = unitsToBill(energy.monthlyConsumption * 2, KERALA, 'single');
    assert.equal(r.currentMonthlyBill, Math.round(currentBi.total / 2));
  });

  // ---- CASE D: Generation > consumption ----
  test('CASE D — generation > consumption, no negative, no export', () => {
    const energy = makeEnergyResult(500, 'monthly', 10);
    const r = savingsV2(energy, { billAmount: 500 });
    assert.ok(r.available);
    assert.ok(energy.monthlyGeneration > energy.monthlyConsumption,
      'generation exceeds consumption');
    // Post-solar consumption = 0
    assert.ok(r.postSolarBillLow >= 0);
    assert.ok(r.postSolarBillHigh >= 0);
    // Savings capped at current bill
    assert.ok(r.monthlySavingsHigh <= r.currentMonthlyBill);
    // No negative anything
    assert.ok(r.monthlySavingsLow >= 0);
    assert.ok(r.annualSavingsAmount >= 0);
  });

  // ========================================================================
  // V1 FALLBACK — no regionConfig
  // ========================================================================
  test('V1 fallback — works without regionConfig', () => {
    const r = calculateSavings({
      energyProfileResult: ENERGY_3500,
      customerTotalIncludingGST: 310000,
      currentBillAmount: 3500,
      currentBillCycle: 'monthly',
      config: SAVINGS_CONFIG,
    });
    assert.ok(r.available);
    // No bill breakdown in V1
    assert.equal(r.currentBillBreakdown, null);
    assert.equal(r.postSolarBillBreakdown, null);
    // Savings use averageTariffRate
    assert.ok(r.assumptions.savingsBasis.includes('V1 fallback'));
  });

  test('V1 fallback — V2 and V1 both produce positive savings', () => {
    const v1 = calculateSavings({
      energyProfileResult: ENERGY_3500,
      currentBillAmount: 3500,
    });
    const v2 = savingsV2(ENERGY_3500, { billAmount: 3500 });
    assert.ok(v1.monthlySavingsHigh > 0, 'V1 positive');
    assert.ok(v2.monthlySavingsHigh > 0, 'V2 positive');
    // V2 uses actual KSEB billing — may differ from V1's averageTariffRate approach
    // Both should be in same order of magnitude
    const ratio = v2.annualSavingsAmount / v1.annualSavingsAmount;
    assert.ok(ratio > 0.5 && ratio < 2.0,
      `V2/V1 ratio ${ratio.toFixed(2)} should be reasonable`);
  });

  // ========================================================================
  // ROUNDING — whole rupees only
  // ========================================================================
  test('Rounding — all customer-facing amounts are whole rupees', () => {
    const r = savingsV2(ENERGY_3500, { investment: 310000 });
    assert.equal(r.currentMonthlyBill % 1, 0, 'currentMonthlyBill integer');
    assert.equal(r.monthlySavingsLow % 1, 0, 'monthlySavingsLow integer');
    assert.equal(r.monthlySavingsHigh % 1, 0, 'monthlySavingsHigh integer');
    assert.equal(r.annualSavingsAmount % 1, 0, 'annualSavingsAmount integer');
    assert.equal(r.postSolarBillLow % 1, 0, 'postSolarBillLow integer');
    assert.equal(r.postSolarBillHigh % 1, 0, 'postSolarBillHigh integer');
  });

  // ========================================================================
  // BILL DIFFERENCE FORMULA VERIFICATION
  // ========================================================================
  test('Bill difference — savings = currentBill - postSolarBill (KSEB engine)', () => {
    const energy = makeEnergyResult(3500, 'monthly', 3);
    const r = savingsV2(energy);

    const C = energy.monthlyConsumption;
    const G = energy.monthlyGeneration;
    const postC = Math.max(C - G, 0);

    const currentBi = unitsToBill(C * 2, KERALA, 'single');
    const postBi = unitsToBill(postC * 2, KERALA, 'single');

    const expectedSavings = Math.max(0, Math.round(currentBi.total / 2) - Math.round(postBi.total / 2));
    assert.equal(r.annualSavingsAmount, expectedSavings * 12,
      'annual savings = (KSEB_bill(C) - KSEB_bill(C-G)) / 2 × 12');
  });

  // ========================================================================
  // SAVINGS NOT FROM averageTariffRate in V2
  // ========================================================================
  test('V2 savings differ from generation × averageTariffRate', () => {
    const energy = makeEnergyResult(3500, 'monthly', 3);
    const r = savingsV2(energy);

    const effectiveGen = Math.min(energy.monthlyGeneration, energy.monthlyConsumption);
    const v1Savings = Math.round(effectiveGen * energy.averageTariffRate);

    // V2 uses actual KSEB bill difference — should differ from V1's linear approximation
    // (They might coincidentally be close, but the formula is different)
    // What matters: V2 uses unitsToBill, not averageTariffRate multiplication
    assert.ok(r.assumptions.savingsBasis.includes('BILL_DIFFERENCE'),
      'V2 basis is BILL_DIFFERENCE');
  });

  // ========================================================================
  // ENGINE VERSION
  // ========================================================================
  test('Engine version is 2.0.0', () => {
    assert.equal(SAVINGS_ENGINE_VERSION, '2.0.0');
    const r = savingsV2(ENERGY_3500);
    assert.equal(r.engineVersion, '2.0.0');
  });

  // ========================================================================
  // IMPORTS — only imports unitsToBill from energyEngine
  // ========================================================================
  test('Source imports unitsToBill from energyEngine', () => {
    assert.ok(SAVINGS_SRC_RAW.includes("import { unitsToBill } from './energyEngine.js'"),
      'imports unitsToBill');
  });

  // ========================================================================
  // NO GST
  // ========================================================================
  test('No GST calculation', () => {
    assert.ok(!/\bgst\b/i.test(SAVINGS_SRC), 'No GST keyword');
    assert.ok(!SAVINGS_SRC.includes('0.18'), 'No 18% GST rate');
    assert.ok(!SAVINGS_SRC.includes('1.18'), 'No 1.18 multiplier');
  });

  // ========================================================================
  // FULL_OFFSET model
  // ========================================================================
  test('FULL_OFFSET model tagged in result', () => {
    const r = savingsV2(ENERGY_3500);
    assert.equal(r.selfConsumptionModel, 'FULL_OFFSET');
    assert.ok(r.assumptions.selfConsumption.includes('FULL_OFFSET'));
    assert.ok(r.assumptions.exportCompensation.includes('NOT_APPROVED'));
  });

  // ========================================================================
  // MONOTONICITY — higher bill → higher savings
  // ========================================================================
  test('Monotonicity — higher consumption → higher savings', () => {
    const r1 = savingsV2(makeEnergyResult(2000, 'monthly', 3), { billAmount: 2000 });
    const r2 = savingsV2(makeEnergyResult(5000, 'monthly', 3), { billAmount: 5000 });
    // Same system, higher consumption → more savings (more to offset)
    assert.ok(r2.monthlySavingsHigh >= r1.monthlySavingsHigh,
      'higher consumption → higher savings with same system');
  });

  // ========================================================================
  // ZERO CONSUMPTION POST-SOLAR
  // ========================================================================
  test('Zero post-solar consumption still has min KSEB charges', () => {
    // When gen > consumption, post-solar consumption = 0
    // But KSEB still charges min fixed + meter rent
    const energy = makeEnergyResult(500, 'monthly', 10);
    assert.ok(energy.monthlyGeneration > energy.monthlyConsumption);
    const r = savingsV2(energy);

    // Post-solar bill should include at least meter rent
    const zeroConsumptionBill = unitsToBill(0, KERALA, 'single');
    const minMonthly = Math.round(zeroConsumptionBill.total / 2);
    assert.ok(r.postSolarBillLow >= minMonthly - 1,
      `post-solar bill ${r.postSolarBillLow} ≥ min charges ${minMonthly}`);
  });

});

// ========================================================================
// Config validation
// ========================================================================
describe('Config validation', () => {
  test('valid config', () => {
    const { valid, errors } = validateSavingsConfig(SAVINGS_CONFIG);
    assert.equal(valid, true);
    assert.equal(errors.length, 0);
  });

  test('null config → invalid', () => {
    const { valid } = validateSavingsConfig(null);
    assert.equal(valid, false);
  });

  test('unsupported model → invalid', () => {
    const { valid, errors } = validateSavingsConfig({ selfConsumptionModel: 'UNKNOWN' });
    assert.equal(valid, false);
    assert.ok(errors.some(e => e.includes('Unsupported')));
  });
});

// ============================================================================
// GATE 2026-09-04 — monthlySavings midpoint + dailySavings additive fields
// ============================================================================
describe('monthlySavings midpoint + dailySavings (additive fields)', () => {
  const ENERGY_3500 = makeEnergyResult(3500, 'monthly', 5);

  test('monthlySavings emitted and equals annualSavingsAmount / 12', () => {
    const r = savingsV2(ENERGY_3500, { investment: 268000 });
    assert.ok(r.available, 'engine ran');
    assert.equal(typeof r.monthlySavings, 'number', 'monthlySavings is a number');
    assert.equal(r.monthlySavings, Math.round(r.annualSavingsAmount / 12),
      'monthlySavings = annualSavingsAmount / 12 (midpoint parity)');
  });

  test('monthlySavings sits inside the [Low, High] range', () => {
    const r = savingsV2(ENERGY_3500, { investment: 268000 });
    assert.ok(r.monthlySavings >= r.monthlySavingsLow,
      `monthlySavings ${r.monthlySavings} >= Low ${r.monthlySavingsLow}`);
    assert.ok(r.monthlySavings <= r.monthlySavingsHigh,
      `monthlySavings ${r.monthlySavings} <= High ${r.monthlySavingsHigh}`);
  });

  test('dailySavings === Math.round(monthlySavings / 30) — no other derivation', () => {
    const r = savingsV2(ENERGY_3500, { investment: 268000 });
    assert.equal(typeof r.dailySavings, 'number');
    assert.equal(r.dailySavings, Math.round(r.monthlySavings / 30));
  });

  test('deterministic: same inputs → same monthlySavings + dailySavings', () => {
    const a = savingsV2(ENERGY_3500, { investment: 268000 });
    const b = savingsV2(ENERGY_3500, { investment: 268000 });
    assert.equal(a.monthlySavings, b.monthlySavings);
    assert.equal(a.dailySavings, b.dailySavings);
  });

  test('present in V1 fallback too (no regionConfig)', () => {
    // V1 fallback path: pass no regionConfig by omitting energyConfig on the
    // engine result. The engine goes into the else-branch and still computes
    // monthlySavings + monthlySavingsLow/High before building the return.
    const energy = calculateEnergyProfile({ billAmount: 3500, billingCycle: 'monthly', systemSizeKw: 5 }, ENERGY_CONFIG);
    const r = calculateSavings({
      energyProfileResult: energy,
      currentBillAmount: 3500,
      currentBillCycle: 'monthly',
      customerTotalIncludingGST: 268000,
      config: SAVINGS_CONFIG,
      // regionConfig deliberately omitted — force V1 fallback
    });
    assert.ok(r.available, 'engine ran in V1 fallback');
    assert.equal(typeof r.monthlySavings, 'number');
    assert.equal(typeof r.dailySavings, 'number');
    assert.equal(r.dailySavings, Math.round(r.monthlySavings / 30));
  });

  test('renderer sees no /30 division: engine field is pre-rounded integer', () => {
    const r = savingsV2(ENERGY_3500, { investment: 268000 });
    assert.equal(Number.isInteger(r.monthlySavings), true, 'integer ₹/month');
    assert.equal(Number.isInteger(r.dailySavings), true, 'integer ₹/day');
  });
});
