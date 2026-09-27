/**
 * ENERGY ENGINE TESTS — comprehensive billing + energy profile tests.
 *
 * Categories:
 *   A. Telescopic energy charges (50–250 monthly / 100–500 bi-monthly)
 *   B. Non-telescopic energy charges (300–600 monthly / 600–1200 bi-monthly)
 *   C. Single phase fixed charges
 *   D. Three phase fixed charges
 *   E. Meter rent
 *   F. Electricity duty
 *   G. Bi-monthly billing
 *   H. Reverse bill estimation
 *   I. Boundary transitions (telescopic ↔ non-telescopic)
 *   J. ₹3,500/month customer
 *   K. ₹7,000 bi-monthly customer
 *   L. High-consumption customer
 *   M. Deterministic results
 *   N. Existing Energy Engine regression (structural / contract tests)
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  calculateEnergyProfile,
  unitsToBill,
  billToUnits,
  validateEnergyConfig,
  listRegions,
  ENERGY_ENGINE_VERSION,
  ENERGY_SOURCE,
  ENERGY_STATUS_LIVE,
  ENERGY_ERROR,
} from '../src/lib/energyEngine.js';

// Load the real energy config
const energyConfig = JSON.parse(readFileSync('data/energy-config.json', 'utf8'));
const keralaConfig = energyConfig.regions.kerala;

/** Strip JS comments so source-scan tests only check executable code */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
}

// ===========================================================================
// A. Telescopic energy charges
// ===========================================================================

describe('A. Telescopic energy charges', () => {

  test('A1. 100 bi-monthly units (50 monthly) — first slab only', () => {
    const bill = unitsToBill(100, keralaConfig);
    // 100 × 3.35 = 335
    assert.equal(bill.energyCharge, 335);
    assert.equal(bill.billingCategory, 'telescopic');
    assert.equal(bill.monthlyUnits, 50);
  });

  test('A2. 200 bi-monthly units (100 monthly) — two slabs', () => {
    const bill = unitsToBill(200, keralaConfig);
    // 100×3.35 + 100×4.25 = 335 + 425 = 760
    assert.equal(bill.energyCharge, 760);
    assert.equal(bill.billingCategory, 'telescopic');
  });

  test('A3. 300 bi-monthly units (150 monthly) — three slabs', () => {
    const bill = unitsToBill(300, keralaConfig);
    // 100×3.35 + 100×4.25 + 100×5.35 = 335 + 425 + 535 = 1295
    assert.equal(bill.energyCharge, 1295);
    assert.equal(bill.billingCategory, 'telescopic');
  });

  test('A4. 400 bi-monthly units (200 monthly) — four slabs', () => {
    const bill = unitsToBill(400, keralaConfig);
    // 335 + 425 + 535 + 100×7.20 = 1295 + 720 = 2015
    assert.equal(bill.energyCharge, 2015);
    assert.equal(bill.billingCategory, 'telescopic');
  });

  test('A5. 500 bi-monthly units (250 monthly) — all five telescopic slabs', () => {
    const bill = unitsToBill(500, keralaConfig);
    // 335 + 425 + 535 + 720 + 100×8.50 = 2015 + 850 = 2865
    assert.equal(bill.energyCharge, 2865);
    assert.equal(bill.billingCategory, 'telescopic');
    assert.equal(bill.monthlyUnits, 250);
  });

  test('A6. Partial slab — 150 bi-monthly units (75 monthly)', () => {
    const bill = unitsToBill(150, keralaConfig);
    // 100×3.35 + 50×4.25 = 335 + 212.5 = 547.5 → 548
    assert.equal(bill.energyCharge, 548);
    assert.equal(bill.billingCategory, 'telescopic');
  });
});

// ===========================================================================
// B. Non-telescopic energy charges
// ===========================================================================

describe('B. Non-telescopic energy charges', () => {

  test('B1. 600 bi-monthly (300 monthly) — first non-telescopic band', () => {
    const bill = unitsToBill(600, keralaConfig);
    // Entire consumption at 6.75: 600 × 6.75 = 4050
    assert.equal(bill.energyCharge, 4050);
    assert.equal(bill.billingCategory, 'nonTelescopic');
  });

  test('B2. 700 bi-monthly (350 monthly)', () => {
    const bill = unitsToBill(700, keralaConfig);
    // 700 × 7.60 = 5320
    assert.equal(bill.energyCharge, 5320);
    assert.equal(bill.billingCategory, 'nonTelescopic');
  });

  test('B3. 800 bi-monthly (400 monthly)', () => {
    const bill = unitsToBill(800, keralaConfig);
    // 800 × 7.95 = 6360
    assert.equal(bill.energyCharge, 6360);
    assert.equal(bill.billingCategory, 'nonTelescopic');
  });

  test('B4. 1000 bi-monthly (500 monthly)', () => {
    const bill = unitsToBill(1000, keralaConfig);
    // 1000 × 8.25 = 8250
    assert.equal(bill.energyCharge, 8250);
    assert.equal(bill.billingCategory, 'nonTelescopic');
  });

  test('B5. 1200 bi-monthly (600 monthly) — highest band', () => {
    const bill = unitsToBill(1200, keralaConfig);
    // 1200 × 9.20 = 11040
    assert.equal(bill.energyCharge, 11040);
    assert.equal(bill.billingCategory, 'nonTelescopic');
  });

  test('B6. 550 bi-monthly — just above threshold, first non-telescopic band', () => {
    const bill = unitsToBill(550, keralaConfig);
    // 550 × 6.75 = 3712.5 → 3713
    assert.equal(bill.energyCharge, 3713);
    assert.equal(bill.billingCategory, 'nonTelescopic');
  });
});

// ===========================================================================
// C. Single phase fixed charges
// ===========================================================================

describe('C. Single phase fixed charges', () => {

  test('C1. 100 bi-monthly → ₹100 fixed (₹50/month)', () => {
    const bill = unitsToBill(100, keralaConfig, 'single');
    assert.equal(bill.fixedCharge, 100);
  });

  test('C2. 200 bi-monthly → ₹170 fixed (₹85/month)', () => {
    const bill = unitsToBill(200, keralaConfig, 'single');
    assert.equal(bill.fixedCharge, 170);
  });

  test('C3. 300 bi-monthly → ₹210 fixed (₹105/month)', () => {
    const bill = unitsToBill(300, keralaConfig, 'single');
    assert.equal(bill.fixedCharge, 210);
  });

  test('C4. 400 bi-monthly → ₹280 fixed (₹140/month)', () => {
    const bill = unitsToBill(400, keralaConfig, 'single');
    assert.equal(bill.fixedCharge, 280);
  });

  test('C5. 500 bi-monthly → ₹320 fixed (₹160/month)', () => {
    const bill = unitsToBill(500, keralaConfig, 'single');
    assert.equal(bill.fixedCharge, 320);
  });

  test('C6. 600 bi-monthly → ₹440 fixed (₹220/month)', () => {
    const bill = unitsToBill(600, keralaConfig, 'single');
    assert.equal(bill.fixedCharge, 440);
  });

  test('C7. 700 bi-monthly → ₹480 fixed (₹240/month)', () => {
    const bill = unitsToBill(700, keralaConfig, 'single');
    assert.equal(bill.fixedCharge, 480);
  });

  test('C8. 800 bi-monthly → ₹520 fixed (₹260/month)', () => {
    const bill = unitsToBill(800, keralaConfig, 'single');
    assert.equal(bill.fixedCharge, 520);
  });

  test('C9. 1000 bi-monthly → ₹570 fixed (₹285/month)', () => {
    const bill = unitsToBill(1000, keralaConfig, 'single');
    assert.equal(bill.fixedCharge, 570);
  });

  test('C10. 1200 bi-monthly → ₹620 fixed (₹310/month)', () => {
    const bill = unitsToBill(1200, keralaConfig, 'single');
    assert.equal(bill.fixedCharge, 620);
  });
});

// ===========================================================================
// D. Three phase fixed charges
// ===========================================================================

describe('D. Three phase fixed charges', () => {

  test('D1. 100 bi-monthly three phase → ₹260 fixed (₹130/month)', () => {
    const bill = unitsToBill(100, keralaConfig, 'three');
    assert.equal(bill.fixedCharge, 260);
    assert.equal(bill.phase, 'three');
  });

  test('D2. 200 bi-monthly → ₹350 fixed (₹175/month)', () => {
    const bill = unitsToBill(200, keralaConfig, 'three');
    assert.equal(bill.fixedCharge, 350);
  });

  test('D3. 300 bi-monthly → ₹410 fixed (₹205/month)', () => {
    const bill = unitsToBill(300, keralaConfig, 'three');
    assert.equal(bill.fixedCharge, 410);
  });

  test('D4. 500 bi-monthly → ₹470 fixed (₹235/month)', () => {
    const bill = unitsToBill(500, keralaConfig, 'three');
    assert.equal(bill.fixedCharge, 470);
  });

  test('D5. 800 bi-monthly → ₹520 fixed (₹260/month)', () => {
    const bill = unitsToBill(800, keralaConfig, 'three');
    assert.equal(bill.fixedCharge, 520);
  });

  test('D6. 1200 bi-monthly → ₹620 fixed (₹310/month)', () => {
    const bill = unitsToBill(1200, keralaConfig, 'three');
    assert.equal(bill.fixedCharge, 620);
  });
});

// ===========================================================================
// E. Meter rent
// ===========================================================================

describe('E. Meter rent', () => {

  test('E1. Single phase meter rent = ₹12 bi-monthly', () => {
    const bill = unitsToBill(200, keralaConfig, 'single');
    assert.equal(bill.meterRent, 12);
  });

  test('E2. Three phase meter rent = ₹30 bi-monthly', () => {
    const bill = unitsToBill(200, keralaConfig, 'three');
    assert.equal(bill.meterRent, 30);
  });

  test('E3. Default (no phase) = single phase meter rent', () => {
    const bill = unitsToBill(200, keralaConfig);
    assert.equal(bill.meterRent, 12);
  });
});

// ===========================================================================
// F. Electricity duty
// ===========================================================================

describe('F. Electricity duty', () => {

  test('F1. Duty = 10% of energy charge (telescopic)', () => {
    const bill = unitsToBill(200, keralaConfig);
    // Energy: 760, Duty: 76
    assert.equal(bill.duty, 76);
    assert.equal(bill.duty, Math.round(bill.energyCharge * 0.10));
  });

  test('F2. Duty = 10% of energy charge (non-telescopic)', () => {
    const bill = unitsToBill(600, keralaConfig);
    // Energy: 4050, Duty: 405
    assert.equal(bill.duty, 405);
    assert.equal(bill.duty, Math.round(bill.energyCharge * 0.10));
  });

  test('F3. Duty does NOT include fixed charge', () => {
    const bill = unitsToBill(500, keralaConfig, 'single');
    // Energy: 2865, Fixed: 320
    // Duty should be 287 (10% of 2865), NOT 319 (10% of 2865+320)
    assert.equal(bill.duty, Math.round(2865 * 0.10));
    assert.notEqual(bill.duty, Math.round((2865 + 320) * 0.10));
  });

  test('F4. Duty does NOT include meter rent', () => {
    const bill = unitsToBill(500, keralaConfig, 'three');
    // Energy: 2865, Meter rent: 30
    // Duty should be 287 (10% of 2865), NOT 290 (10% of 2865+30)
    assert.equal(bill.duty, Math.round(2865 * 0.10));
  });
});

// ===========================================================================
// G. Bi-monthly billing
// ===========================================================================

describe('G. Bi-monthly billing', () => {

  test('G1. Total = energy + fixed + duty + meter rent', () => {
    const bill = unitsToBill(500, keralaConfig, 'single');
    assert.equal(bill.total, bill.energyCharge + bill.fixedCharge + bill.duty + bill.meterRent);
    // 2865 + 320 + 287 + 12 = 3484
    assert.equal(bill.total, 3484);
  });

  test('G2. ₹6000 bimonthly = ₹3000 monthly → same consumption as ₹3000 monthly', () => {
    const monthly = calculateEnergyProfile(
      { billAmount: 3000, billingCycle: 'monthly' },
      energyConfig
    );
    const bimonthly = calculateEnergyProfile(
      { billAmount: 6000, billingCycle: 'bimonthly' },
      energyConfig
    );
    assert.equal(monthly.monthlyConsumption, bimonthly.monthlyConsumption);
    assert.equal(monthly.recommendedSystemSizeKw, bimonthly.recommendedSystemSizeKw);
  });

  test('G3. Monthly units = bi-monthly / 2 (rounded)', () => {
    const bill = unitsToBill(301, keralaConfig);
    assert.equal(bill.monthlyUnits, Math.round(301 / 2));
  });

  test('G4. Annual consumption = monthly × 12', () => {
    const result = calculateEnergyProfile(
      { billAmount: 4000, billingCycle: 'monthly' },
      energyConfig
    );
    assert.equal(result.annualConsumption, result.monthlyConsumption * 12);
  });
});

// ===========================================================================
// H. Reverse bill estimation
// ===========================================================================

describe('H. Reverse bill estimation', () => {

  test('H1. Forward + reverse round-trip (telescopic)', () => {
    const bill = unitsToBill(400, keralaConfig);
    const reverseUnits = billToUnits(bill.total, keralaConfig);
    assert.ok(Math.abs(reverseUnits - 400) <= 1, `expected ~400, got ${reverseUnits}`);
  });

  test('H2. Forward + reverse round-trip (non-telescopic)', () => {
    const bill = unitsToBill(700, keralaConfig);
    const reverseUnits = billToUnits(bill.total, keralaConfig);
    assert.ok(Math.abs(reverseUnits - 700) <= 1, `expected ~700, got ${reverseUnits}`);
  });

  test('H3. Forward + reverse round-trip (single phase)', () => {
    const bill = unitsToBill(600, keralaConfig, 'single');
    const reverseUnits = billToUnits(bill.total, keralaConfig, 'single');
    assert.ok(Math.abs(reverseUnits - 600) <= 1, `expected ~600, got ${reverseUnits}`);
  });

  test('H4. Forward + reverse round-trip (three phase)', () => {
    const bill = unitsToBill(600, keralaConfig, 'three');
    const reverseUnits = billToUnits(bill.total, keralaConfig, 'three');
    assert.ok(Math.abs(reverseUnits - 600) <= 1, `expected ~600, got ${reverseUnits}`);
  });

  test('H5. Reverse handles telescopic/non-telescopic boundary', () => {
    // Bill at 500 (telescopic) = 3484
    // Bill at 501+ is non-telescopic
    // A bill of 3484 should reverse to ~500
    const reverseUnits = billToUnits(3484, keralaConfig);
    assert.ok(Math.abs(reverseUnits - 500) <= 1, `expected ~500, got ${reverseUnits}`);
  });

  test('H6. Reverse handles "impossible" bill in discontinuity gap', () => {
    // Bills between telescopic max (3484) and non-telescopic min (501×6.75=...)
    // should converge to the boundary
    const bill500 = unitsToBill(500, keralaConfig).total;
    const bill501 = unitsToBill(501, keralaConfig).total;
    // A target bill in the gap should converge to one side
    const gapBill = Math.round((bill500 + bill501) / 2);
    const reverseUnits = billToUnits(gapBill, keralaConfig);
    assert.ok(reverseUnits >= 499 && reverseUnits <= 502,
      `gap bill ${gapBill} should resolve near boundary, got ${reverseUnits}`);
  });

  test('H7. Three phase reverse handles different fixed charges', () => {
    // Same bill amount, different phase → different consumption estimate
    // Use ₹8000 bi-monthly — well within non-telescopic, avoids boundary convergence
    const units_1p = billToUnits(8000, keralaConfig, 'single');
    const units_3p = billToUnits(8000, keralaConfig, 'three');
    // Three phase has higher fixed charge + meter rent → fewer units for same bill
    assert.ok(units_3p < units_1p,
      `three phase (${units_3p}) should estimate fewer units than single (${units_1p}) for ₹8000 bill`);
    // Also verify forward direction: same units → different totals by phase
    const bill_1p = unitsToBill(800, keralaConfig, 'single');
    const bill_3p = unitsToBill(800, keralaConfig, 'three');
    assert.ok(bill_3p.total > bill_1p.total,
      `three phase total (${bill_3p.total}) should exceed single (${bill_1p.total}) at 800 units`);
  });
});

// ===========================================================================
// I. Boundary transitions
// ===========================================================================

describe('I. Boundary transitions', () => {

  test('I1. 500 bi-monthly is telescopic, 501 is non-telescopic', () => {
    const bill500 = unitsToBill(500, keralaConfig);
    const bill501 = unitsToBill(501, keralaConfig);
    assert.equal(bill500.billingCategory, 'telescopic');
    assert.equal(bill501.billingCategory, 'nonTelescopic');
  });

  test('I2. Non-telescopic total always exceeds telescopic at boundary', () => {
    const bill500 = unitsToBill(500, keralaConfig);
    const bill501 = unitsToBill(501, keralaConfig);
    assert.ok(bill501.total > bill500.total,
      `non-telescopic 501 (${bill501.total}) must exceed telescopic 500 (${bill500.total})`);
  });

  test('I3. Non-telescopic band transitions produce expected jumps', () => {
    const bill600 = unitsToBill(600, keralaConfig);
    const bill601 = unitsToBill(601, keralaConfig);
    // 600 at 6.75, 601 at 7.60 — rate jump
    assert.ok(bill601.energyCharge > bill600.energyCharge + 100,
      'band transition at 600→601 should produce significant jump');
  });

  test('I4. Bill is monotonically increasing across all boundaries', () => {
    // Check at every important threshold
    const thresholds = [99, 100, 101, 199, 200, 201, 499, 500, 501, 599, 600, 601, 699, 700, 701, 999, 1000, 1001];
    let prevTotal = 0;
    for (const units of thresholds) {
      const bill = unitsToBill(units, keralaConfig);
      assert.ok(bill.total >= prevTotal,
        `bill at ${units} units (${bill.total}) must be ≥ bill at previous threshold (${prevTotal})`);
      prevTotal = bill.total;
    }
  });
});

// ===========================================================================
// J. ₹3,500/month customer
// ===========================================================================

describe('J. ₹3,500/month customer', () => {

  test('J1. ₹3,500/month → reasonable consumption estimate', () => {
    const result = calculateEnergyProfile(
      { billAmount: 3500, billingCycle: 'monthly' },
      energyConfig
    );
    assert.equal(result.available, true);
    // ₹7000 bi-monthly. Non-telescopic territory.
    // ~740 bi-monthly units → ~370 monthly units
    assert.ok(result.monthlyConsumption >= 300 && result.monthlyConsumption <= 450,
      `expected 300-450 monthly units, got ${result.monthlyConsumption}`);
    assert.equal(result.billBreakdown.billingCategory, 'nonTelescopic');
  });

  test('J2. ₹3,500 bill breakdown components are non-trivial', () => {
    const result = calculateEnergyProfile(
      { billAmount: 3500, billingCycle: 'monthly' },
      energyConfig
    );
    const b = result.billBreakdown;
    assert.ok(b.energyCharge > 0, 'energy charge positive');
    assert.ok(b.fixedCharge > 100, 'fixed charge > ₹100 bi-monthly for this consumption');
    assert.ok(b.duty > 0, 'duty positive');
    assert.ok(b.meterRent > 0, 'meter rent positive');
    assert.equal(b.total, b.energyCharge + b.fixedCharge + b.duty + b.meterRent);
  });

  test('J3. ₹3,500/month generates valid system recommendation', () => {
    const result = calculateEnergyProfile(
      { billAmount: 3500, billingCycle: 'monthly' },
      energyConfig
    );
    assert.ok(result.recommendedSystemSizeKw >= 2 && result.recommendedSystemSizeKw <= 5,
      `expected 2-5 kW, got ${result.recommendedSystemSizeKw}`);
  });
});

// ===========================================================================
// K. ₹7,000 bi-monthly customer
// ===========================================================================

describe('K. ₹7,000 bi-monthly customer', () => {

  test('K1. ₹7,000 bi-monthly = ₹3,500 monthly — same result', () => {
    const monthly = calculateEnergyProfile(
      { billAmount: 3500, billingCycle: 'monthly' },
      energyConfig
    );
    const bimonthly = calculateEnergyProfile(
      { billAmount: 7000, billingCycle: 'bimonthly' },
      energyConfig
    );
    assert.equal(monthly.monthlyConsumption, bimonthly.monthlyConsumption);
    assert.equal(monthly.averageTariffRate, bimonthly.averageTariffRate);
  });
});

// ===========================================================================
// L. High-consumption customer
// ===========================================================================

describe('L. High-consumption customer', () => {

  test('L1. ₹10,000/month → highest non-telescopic band', () => {
    const result = calculateEnergyProfile(
      { billAmount: 10000, billingCycle: 'monthly' },
      energyConfig
    );
    assert.equal(result.available, true);
    assert.equal(result.billBreakdown.billingCategory, 'nonTelescopic');
    // ₹20,000 bi-monthly at ₹9.20/unit → ~1950 bi-monthly → ~975 monthly
    assert.ok(result.monthlyConsumption >= 800,
      `high-consumption customer should have ≥800 monthly units, got ${result.monthlyConsumption}`);
  });

  test('L2. High-consumption three phase', () => {
    const result = calculateEnergyProfile(
      { billAmount: 10000, billingCycle: 'monthly', phase: 'three' },
      energyConfig
    );
    assert.equal(result.available, true);
    assert.equal(result.phase, 'three');
    assert.equal(result.billBreakdown.phase, 'three');
  });
});

// ===========================================================================
// M. Deterministic results
// ===========================================================================

describe('M. Deterministic results', () => {

  test('M1. Same inputs produce identical results', () => {
    const inputs = { billAmount: 4500, billingCycle: 'monthly' };
    const r1 = calculateEnergyProfile(inputs, energyConfig);
    const r2 = calculateEnergyProfile(inputs, energyConfig);
    assert.deepStrictEqual(r1, r2);
  });

  test('M2. Same inputs with phase produce identical results', () => {
    const inputs = { billAmount: 4500, billingCycle: 'monthly', phase: 'three' };
    const r1 = calculateEnergyProfile(inputs, energyConfig);
    const r2 = calculateEnergyProfile(inputs, energyConfig);
    assert.deepStrictEqual(r1, r2);
  });

  test('M3. Specific bill → specific total (no floating-point drift)', () => {
    // 500 bi-monthly, single phase
    const bill = unitsToBill(500, keralaConfig, 'single');
    assert.equal(bill.total, 3484);
    // Run 10 times — always same
    for (let i = 0; i < 10; i++) {
      assert.equal(unitsToBill(500, keralaConfig, 'single').total, 3484);
    }
  });
});

// ===========================================================================
// N. Existing Energy Engine regression (structural + contract tests)
// ===========================================================================

describe('N. Energy Engine regression', () => {

  test('N1. Kerala yield = 4.0 kWh/kW/day', () => {
    const result = calculateEnergyProfile(
      { billAmount: 3000, billingCycle: 'monthly' },
      energyConfig
    );
    assert.equal(result.available, true);
    assert.equal(result.yieldAssumption.dailyGenPerKw, 4.0);
    assert.equal(result.yieldAssumption.unit, 'kWh/kW/day');
  });

  test('N2. Generation = yield × system size', () => {
    const result = calculateEnergyProfile(
      { billAmount: 3000, billingCycle: 'monthly' },
      energyConfig
    );
    const kw = result.recommendedSystemSizeKw;
    assert.equal(result.monthlyGeneration, kw * Math.round(4.0 * 30));
    assert.equal(result.annualGeneration, result.monthlyGeneration * 12);
    // Daily generation range = ±10%
    const dailyGen = kw * 4.0;
    assert.equal(result.dailyGenerationLow, Math.round(dailyGen * 0.9 * 10) / 10);
    assert.equal(result.dailyGenerationHigh, Math.round(dailyGen * 1.1 * 10) / 10);
  });

  test('N3. System sizing covers ≥85% of consumption', () => {
    const result = calculateEnergyProfile(
      { billAmount: 5000, billingCycle: 'monthly' },
      energyConfig
    );
    const monthlyGenPerKw = Math.round(4.0 * 30);
    const coverageRatio = (result.recommendedSystemSizeKw * monthlyGenPerKw) / result.monthlyConsumption;
    assert.ok(coverageRatio >= 0.85, `coverage ${coverageRatio} must be ≥ 0.85`);
    assert.equal(result.sizingAssumption.coverageTarget, 0.85);
  });

  test('N4. Explicit system size overrides auto-sizing', () => {
    const result = calculateEnergyProfile(
      { billAmount: 5000, billingCycle: 'monthly', systemSizeKw: 10 },
      energyConfig
    );
    assert.equal(result.recommendedSystemSizeKw, 10);
  });

  test('N5. Different tariff slabs produce different results', () => {
    const modifiedConfig = {
      ...energyConfig,
      regions: {
        ...energyConfig.regions,
        test_state: {
          ...keralaConfig,
          regionId: 'test_state',
          regionName: 'Test State',
          tariffSlabs: [
            { upToUnits: 100, ratePerUnit: 5.00 },
            { upToUnits: 200, ratePerUnit: 7.00 },
            { upToUnits: 300, ratePerUnit: 9.00 },
          ],
          nonTelescopicThreshold: 300,
          // Old-style flat rate for backward compat test
          nonTelescopicRate: 10.00,
          fixedChargeBiMonthly: 80,
          meterRentBiMonthly: 14,
        },
      },
    };

    // Use ₹2000/month — divergent tariff rates make results differ at this amount
    const kerala = calculateEnergyProfile(
      { billAmount: 2000, billingCycle: 'monthly' },
      energyConfig, 'kerala'
    );
    const testState = calculateEnergyProfile(
      { billAmount: 2000, billingCycle: 'monthly' },
      modifiedConfig, 'test_state'
    );

    assert.equal(kerala.available, true);
    assert.equal(testState.available, true);
    assert.notEqual(kerala.monthlyConsumption, testState.monthlyConsumption,
      `Different tariff configs should produce different consumption for same bill amount`);
  });

  test('N6. Different yield produces different generation', () => {
    const highYieldConfig = {
      ...energyConfig,
      regions: {
        ...energyConfig.regions,
        rajasthan: {
          ...keralaConfig,
          regionId: 'rajasthan',
          regionName: 'Rajasthan',
          yield: { dailyGenPerKw: 5.5, unit: 'kWh/kW/day', source: 'Rajasthan high GHI' },
        },
      },
    };

    const kerala = calculateEnergyProfile(
      { billAmount: 3000, billingCycle: 'monthly' },
      energyConfig, 'kerala'
    );
    const rajasthan = calculateEnergyProfile(
      { billAmount: 3000, billingCycle: 'monthly' },
      highYieldConfig, 'rajasthan'
    );

    assert.equal(kerala.yieldAssumption.dailyGenPerKw, 4.0);
    assert.equal(rajasthan.yieldAssumption.dailyGenPerKw, 5.5);
    assert.ok(rajasthan.recommendedSystemSizeKw <= kerala.recommendedSystemSizeKw);
  });

  test('N7. Unsupported region returns BLOCKED', () => {
    const result = calculateEnergyProfile(
      { billAmount: 3000, billingCycle: 'monthly' },
      energyConfig, 'tamil_nadu'
    );
    assert.equal(result.available, false);
    assert.equal(result.status, 'BLOCKED');
    assert.equal(result.error, ENERGY_ERROR.NO_REGION_CONFIG);
  });

  test('N8. Config version tracked in result', () => {
    const result = calculateEnergyProfile(
      { billAmount: 3000, billingCycle: 'monthly' },
      energyConfig
    );
    assert.equal(result.configVersion, 'energy-config.2');
    assert.equal(result.tariffVersion, '2026-27-phase3');
    assert.equal(result.engineVersion, ENERGY_ENGINE_VERSION);
  });

  test('N9. Snapshot immutability', () => {
    const result = calculateEnergyProfile(
      { billAmount: 3000, billingCycle: 'monthly' },
      energyConfig
    );
    const frozenResult = Object.freeze(JSON.parse(JSON.stringify(result)));

    const newConfig = JSON.parse(JSON.stringify(energyConfig));
    newConfig.regions.kerala.tariffSlabs[0].ratePerUnit = 99.00;
    newConfig.configVersion = 'energy-config.3';

    assert.equal(frozenResult.configVersion, 'energy-config.2');
    const newResult = calculateEnergyProfile(
      { billAmount: 3000, billingCycle: 'monthly' },
      newConfig
    );
    assert.equal(newResult.configVersion, 'energy-config.3');
    assert.notDeepStrictEqual(frozenResult, newResult);
  });

  test('N10. Energy result does NOT contain payback', () => {
    const result = calculateEnergyProfile(
      { billAmount: 5000, billingCycle: 'monthly' },
      energyConfig
    );
    assert.equal(result.paybackYears, undefined);
    assert.equal(result.annualSavings, undefined);
    assert.equal(result.monthlySavings, undefined);
    assert.ok(result.averageTariffRate > 0);
  });

  test('N11. Energy Engine source code does not import procurement', () => {
    const src = stripComments(readFileSync('src/lib/energyEngine.js', 'utf8'));
    assert.ok(!src.includes('procurement'), 'must not reference procurement');
    assert.ok(!src.includes('server-bom-builder'), 'must not reference BOM builder');
    assert.ok(!src.includes('catalog'), 'must not reference catalog');
  });

  test('N12. Energy Engine does not calculate price', () => {
    const src = stripComments(readFileSync('src/lib/energyEngine.js', 'utf8'));
    assert.ok(!src.includes('quotationPrice'), 'must not reference quotation price');
    assert.ok(!src.includes('totalPrice'), 'must not reference total price');
    assert.ok(!src.includes('perWatt'), 'must not reference per-watt pricing');
  });

  test('N13. Energy Engine does not calculate EMI', () => {
    const src = stripComments(readFileSync('src/lib/energyEngine.js', 'utf8'));
    assert.ok(!src.includes('loanAmount'), 'must not reference loan amount');
    assert.ok(!src.includes('interestRate'), 'must not reference interest rate');
    assert.ok(!src.includes('tenure'), 'must not reference tenure');
  });

  test('N14. Invalid bill amount returns BLOCKED', () => {
    const zero = calculateEnergyProfile({ billAmount: 0 }, energyConfig);
    assert.equal(zero.available, false);
    assert.equal(zero.error, ENERGY_ERROR.INVALID_BILL_AMOUNT);

    const neg = calculateEnergyProfile({ billAmount: -100 }, energyConfig);
    assert.equal(neg.available, false);

    const nan = calculateEnergyProfile({ billAmount: 'abc' }, energyConfig);
    assert.equal(nan.available, false);
  });

  test('N15. validateEnergyConfig rejects bad input', () => {
    assert.throws(() => validateEnergyConfig(null));
    assert.throws(() => validateEnergyConfig({}));
    assert.throws(() => validateEnergyConfig({ regions: {} }));
    assert.doesNotThrow(() => validateEnergyConfig(energyConfig));
  });

  test('N16. listRegions returns Kerala', () => {
    const regions = listRegions(energyConfig);
    assert.equal(regions.length, 1);
    assert.equal(regions[0].regionId, 'kerala');
    assert.equal(regions[0].discom, 'KSEB');
    assert.equal(regions[0].tariffName, 'LT-1A Domestic');
  });

  test('N17. Result has explicit units on all numeric fields', () => {
    const result = calculateEnergyProfile(
      { billAmount: 3000, billingCycle: 'monthly' },
      energyConfig
    );
    assert.equal(result.monthlyConsumptionUnit, 'kWh');
    assert.equal(result.annualConsumptionUnit, 'kWh');
    assert.equal(result.dailyGenerationUnit, 'kWh');
    assert.equal(result.monthlyGenerationUnit, 'kWh');
    assert.equal(result.annualGenerationUnit, 'kWh');
    assert.equal(result.monthlyKsebValueUnit, '₹');
    assert.equal(result.homeUsesUnitsPerDayUnit, 'kWh');
    assert.equal(result.surplusExportedUnit, 'kWh/day');
    assert.equal(result.averageTariffRateUnit, '₹/kWh');
  });

  test('N18. Source and status tags correct', () => {
    const result = calculateEnergyProfile(
      { billAmount: 3000, billingCycle: 'monthly' },
      energyConfig
    );
    assert.equal(result.source, ENERGY_SOURCE);
    assert.equal(result.status, ENERGY_STATUS_LIVE);
  });

  test('N19. Result compatible with payload contract', () => {
    const result = calculateEnergyProfile(
      { billAmount: 3000, billingCycle: 'monthly' },
      energyConfig
    );
    assert.ok(result.dailyGenerationLow !== undefined);
    assert.ok(result.dailyGenerationHigh !== undefined);
    assert.ok(result.monthlyKsebValueLow !== undefined);
    assert.ok(result.monthlyKsebValueHigh !== undefined);
    assert.ok(result.homeUsesUnitsPerDay !== undefined);
    assert.ok(result.surplusExportedLow !== undefined);
    assert.ok(result.surplusExportedHigh !== undefined);
  });

  test('N20. Missing yield → BLOCKED', () => {
    const noYieldConfig = {
      ...energyConfig,
      regions: {
        broken: {
          ...keralaConfig,
          regionId: 'broken',
          yield: null,
        },
      },
    };
    const result = calculateEnergyProfile(
      { billAmount: 3000, billingCycle: 'monthly' },
      noYieldConfig, 'broken'
    );
    assert.equal(result.available, false);
    assert.equal(result.error, ENERGY_ERROR.NO_YIELD_CONFIG);
  });

  test('N21. Phase defaults to single', () => {
    const result = calculateEnergyProfile(
      { billAmount: 3000, billingCycle: 'monthly' },
      energyConfig
    );
    assert.equal(result.phase, 'single');
    assert.equal(result.billBreakdown.phase, 'single');
  });

  test('N22. Phase three produces different fixed/meter for same units', () => {
    // Same units, different phase → different total bill
    const single = unitsToBill(400, keralaConfig, 'single');
    const three = unitsToBill(400, keralaConfig, 'three');
    // Three phase has higher fixed charge and meter rent
    assert.ok(three.fixedCharge > single.fixedCharge,
      `three phase fixed (${three.fixedCharge}) must exceed single (${single.fixedCharge})`);
    assert.ok(three.meterRent > single.meterRent,
      `three phase meter (${three.meterRent}) must exceed single (${single.meterRent})`);
    assert.ok(three.total > single.total,
      `three phase total (${three.total}) must exceed single (${single.total})`);
    // Energy charge identical (same units, same tariff slabs)
    assert.equal(single.energyCharge, three.energyCharge);
  });

  test('N23. Backward compat — old-style flat config still works', () => {
    const oldStyleConfig = {
      configVersion: 'old-test',
      defaultRegion: 'test',
      regions: {
        test: {
          regionId: 'test',
          regionName: 'Test',
          discom: 'TEST',
          tariffName: 'Test Domestic',
          tariffVersion: 'test-v1',
          tariffSlabs: [
            { upToUnits: 100, ratePerUnit: 5.00 },
            { upToUnits: 200, ratePerUnit: 7.00 },
          ],
          nonTelescopicThreshold: 200,
          nonTelescopicRate: 9.00,
          fixedChargeBiMonthly: 80,
          meterRentBiMonthly: 14,
          electricityDutyPct: 10,
          yield: { dailyGenPerKw: 4.0, unit: 'kWh/kW/day', source: 'test' },
          sizing: { coverageTarget: 0.85 },
        },
      },
    };

    // Telescopic
    const bill100 = unitsToBill(100, oldStyleConfig.regions.test);
    assert.equal(bill100.energyCharge, 500); // 100 × 5.00
    assert.equal(bill100.fixedCharge, 80);   // flat fallback
    assert.equal(bill100.meterRent, 14);     // flat fallback

    // Non-telescopic
    const bill300 = unitsToBill(300, oldStyleConfig.regions.test);
    assert.equal(bill300.energyCharge, 2700); // 300 × 9.00 flat fallback
    assert.equal(bill300.fixedCharge, 80);    // flat fallback

    // Full profile
    const result = calculateEnergyProfile(
      { billAmount: 1000, billingCycle: 'monthly' },
      oldStyleConfig
    );
    assert.equal(result.available, true);
    assert.equal(result.configVersion, 'old-test');
  });

  // Realistic bill validation
  test('N24. Realistic bill validation — 500 bi-monthly single phase', () => {
    const bill = unitsToBill(500, keralaConfig, 'single');
    assert.equal(bill.energyCharge, 2865);   // 100×3.35 + 100×4.25 + 100×5.35 + 100×7.20 + 100×8.50
    assert.equal(bill.fixedCharge, 320);      // ₹160/month × 2
    assert.equal(bill.duty, 287);             // 10% of 2865 = 286.5 → 287
    assert.equal(bill.meterRent, 12);         // ₹6/month × 2
    assert.equal(bill.total, 3484);           // 2865 + 320 + 287 + 12
    assert.equal(bill.billingCategory, 'telescopic');
    assert.equal(bill.phase, 'single');
  });

  test('N25. Realistic bill validation — 800 bi-monthly single phase', () => {
    const bill = unitsToBill(800, keralaConfig, 'single');
    assert.equal(bill.energyCharge, 6360);   // 800 × 7.95
    assert.equal(bill.fixedCharge, 520);      // ₹260/month × 2
    assert.equal(bill.duty, 636);             // 10% of 6360
    assert.equal(bill.meterRent, 12);
    assert.equal(bill.total, 7528);           // 6360 + 520 + 636 + 12
    assert.equal(bill.billingCategory, 'nonTelescopic');
  });

  test('N26. Realistic bill validation — 200 bi-monthly three phase', () => {
    const bill = unitsToBill(200, keralaConfig, 'three');
    assert.equal(bill.energyCharge, 760);    // 100×3.35 + 100×4.25
    assert.equal(bill.fixedCharge, 350);      // ₹175/month × 2
    assert.equal(bill.duty, 76);              // 10% of 760
    assert.equal(bill.meterRent, 30);         // ₹15/month × 2
    assert.equal(bill.total, 1216);           // 760 + 350 + 76 + 30
  });

  test('N27. averageTariffRate is effective bill rate, not energy tariff', () => {
    const result = calculateEnergyProfile(
      { billAmount: 3500, billingCycle: 'monthly' },
      energyConfig
    );
    // avgRate = (biMonthlyBillTotal / 2) / monthlyUnits
    // This includes fixed charge, duty, meter rent spread across units
    const expectedRate = Math.round(((result.billBreakdown.total / 2) / result.monthlyConsumption) * 100) / 100;
    assert.equal(result.averageTariffRate, expectedRate);
    // Should be documented as effective rate
    assert.ok(result.averageTariffRateNote.includes('Effective customer bill rate'));
  });

  test('N28. Engine version is energyEngine.2', () => {
    assert.equal(ENERGY_ENGINE_VERSION, 'energyEngine.2');
  });
});
