/**
 * SUBSIDY ENGINE — Test Suite
 *
 * Tests for calculateSubsidy() — PM Surya Ghar CFA calculation.
 *
 * Categories:
 *   1-8    Residential tiers + edge cases
 *   9-12   GHS/RWA
 *   13-14  Ineligible / none
 *   15-17  DCR + GIVE_IT_UP
 *   18     Kerala state subsidy
 *   19     Maximum residential cap
 *   20     Determinism
 *   21-23  Source scans (no pricing, BOM, procurement)
 *   24-25  Scheme version + calculatedAt
 *   26     Snapshot immutability
 *   27     Output contract
 *   28     Mock provider compatibility
 *   29-31  Config validation + edge cases
 *   32     Engine version
 *   33     No savings engine access
 *   34     Fractional kW
 *   35     Upgrade ambiguity
 *   36     Rounding
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  calculateSubsidy,
  validateSubsidyConfig,
  SUBSIDY_ENGINE_VERSION,
  SUBSIDY_SOURCE,
  SUBSIDY_STATUS_LIVE,
  SUBSIDY_ERROR,
  ELIGIBILITY_STATUS,
} from '../src/lib/subsidyEngine.js';

// ---- Load config + source ---------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(__dirname, '..', 'data', 'subsidy-config.json');
const subsidyConfig = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));

const ENGINE_SRC_RAW = readFileSync(
  resolve(__dirname, '..', 'src', 'lib', 'subsidyEngine.js'), 'utf8');
// Strip comments for source scans (block + line comments)
const ENGINE_SRC = ENGINE_SRC_RAW
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');

// ---- Helper -----------------------------------------------------------------

function residential(kw, opts = {}) {
  return calculateSubsidy({
    systemSizeKw: kw,
    subsidyType: 'residential',
    panelType: 'DCR',
    connectionType: 'domestic',
    subsidyConfig,
    ...opts,
  });
}

function ghsCalc(kw, houses, opts = {}) {
  return calculateSubsidy({
    systemSizeKw: kw,
    subsidyType: 'ghs',
    ghsHouses: houses,
    panelType: 'DCR',
    connectionType: 'domestic',
    subsidyConfig,
    ...opts,
  });
}

// =============================================================================
// RESIDENTIAL TIERS
// =============================================================================

describe('Subsidy Engine — Residential', () => {

  // 1. 1kW = ₹30,000
  test('1 — 1 kW residential = ₹30,000', () => {
    const r = residential(1);
    assert.equal(r.available, true);
    assert.equal(r.totalSubsidy, 30000);
    assert.equal(r.centralSubsidy, 30000);
    assert.equal(r.subsidyAmount, 30000);
    assert.equal(r.eligibilityStatus, 'ELIGIBLE');
    assert.equal(r.subsidyType, 'residential');
  });

  // 2. 2kW = ₹60,000
  test('2 — 2 kW residential = ₹60,000', () => {
    const r = residential(2);
    assert.equal(r.totalSubsidy, 60000);
    assert.equal(r.centralSubsidy, 60000);
    assert.equal(r.eligibilityStatus, 'ELIGIBLE');
  });

  // 3. 3kW = ₹78,000
  test('3 — 3 kW residential = ₹78,000', () => {
    const r = residential(3);
    assert.equal(r.totalSubsidy, 78000);
    assert.equal(r.centralSubsidy, 78000);
    assert.equal(r.eligibilityStatus, 'ELIGIBLE');
  });

  // 4. 4kW = ₹78,000 (capped)
  test('4 — 4 kW residential = ₹78,000 (capped)', () => {
    const r = residential(4);
    assert.equal(r.totalSubsidy, 78000);
    assert.equal(r.eligibilityStatus, 'ELIGIBLE');
  });

  // 5. 5kW = ₹78,000 (capped)
  test('5 — 5 kW residential = ₹78,000 (capped)', () => {
    const r = residential(5);
    assert.equal(r.totalSubsidy, 78000);
    assert.equal(r.eligibilityStatus, 'ELIGIBLE');
  });

  // 6. 10kW = ₹78,000 (max residential)
  test('6 — 10 kW residential = ₹78,000 (max capacity)', () => {
    const r = residential(10);
    assert.equal(r.totalSubsidy, 78000);
    assert.equal(r.eligibilityStatus, 'ELIGIBLE');
    assert.equal(r.eligibleCapacityKw, 10);
  });

  // 7. >10kW = INELIGIBLE
  test('7 — >10 kW residential = INELIGIBLE', () => {
    const r = residential(11);
    assert.equal(r.available, false);
    assert.equal(r.eligibilityStatus, 'INELIGIBLE');
    assert.equal(r.totalSubsidy, 0);
    assert.equal(r.subsidyAmount, 0);
    assert.ok(r.reason.includes('exceeds'));
  });

  // 8. 0 and negative = invalid
  test('8a — 0 kW = invalid input', () => {
    const r = residential(0);
    assert.equal(r.available, false);
    assert.equal(r.status, SUBSIDY_ERROR.INVALID_INPUT);
  });

  test('8b — negative kW = invalid input', () => {
    const r = residential(-1);
    assert.equal(r.available, false);
    assert.equal(r.status, SUBSIDY_ERROR.INVALID_INPUT);
  });

  // 34. Fractional kW (e.g. 1.5kW, 2.5kW)
  test('34a — 1.5 kW residential = ₹45,000', () => {
    const r = residential(1.5);
    assert.equal(r.totalSubsidy, 45000);
    assert.equal(r.eligibilityStatus, 'ELIGIBLE');
  });

  test('34b — 2.5 kW residential = ₹69,000', () => {
    // 2 × 30,000 + 0.5 × 18,000 = 60,000 + 9,000 = 69,000
    const r = residential(2.5);
    assert.equal(r.totalSubsidy, 69000);
  });
});

// =============================================================================
// GHS/RWA
// =============================================================================

describe('Subsidy Engine — GHS/RWA', () => {

  // 9. 1 house × 3kW = ₹54,000
  test('9 — GHS 1 house × 3 kW = ₹54,000', () => {
    const r = ghsCalc(3, 1);
    assert.equal(r.available, true);
    assert.equal(r.totalSubsidy, 54000);
    assert.equal(r.eligibilityStatus, 'ELIGIBLE');
    assert.equal(r.subsidyType, 'ghs');
    assert.equal(r.ghsHouses, 1);
  });

  // 10. Per-house cap (5kW system, capped at 3kW/house)
  test('10 — GHS per-house cap: 5 kW capped at 3 kW/house', () => {
    const r = ghsCalc(5, 1);
    assert.equal(r.eligibleCapacityKw, 3); // capped
    assert.equal(r.totalSubsidy, 54000); // 3 × 18,000
  });

  // 11. 500kW community cap
  test('11 — GHS 500 kW community cap', () => {
    // 200 houses × 3kW = 600kW, but capped at 500kW
    const r = ghsCalc(3, 200);
    assert.equal(r.ghsTotalEligibleKw, 500);
    assert.equal(r.totalSubsidy, 500 * 18000);
  });

  // 12. >500kW verifies cap holds
  test('12 — GHS >500 kW stays capped', () => {
    // 300 houses × 3kW = 900kW → capped 500kW
    const r = ghsCalc(3, 300);
    assert.equal(r.ghsTotalEligibleKw, 500);
    assert.equal(r.totalSubsidy, 9000000); // 500 × 18,000
  });

  // GHS with 10 houses × 3kW
  test('GHS 10 houses × 3 kW = ₹540,000', () => {
    const r = ghsCalc(3, 10);
    assert.equal(r.totalSubsidy, 540000);
    assert.equal(r.ghsTotalEligibleKw, 30);
  });

  // GHS invalid houses
  test('GHS invalid houses (0) = blocked', () => {
    const r = ghsCalc(3, 0);
    assert.equal(r.available, false);
    assert.equal(r.status, SUBSIDY_ERROR.INVALID_INPUT);
  });

  test('GHS invalid houses (fractional) = blocked', () => {
    const r = ghsCalc(3, 2.5);
    assert.equal(r.available, false);
    assert.equal(r.status, SUBSIDY_ERROR.INVALID_INPUT);
  });
});

// =============================================================================
// INELIGIBLE / NONE
// =============================================================================

describe('Subsidy Engine — Ineligible / None', () => {

  // 13. Non-residential (commercial) = ineligible
  test('13 — commercial connection = INELIGIBLE', () => {
    const r = residential(3, { connectionType: 'commercial' });
    assert.equal(r.available, false);
    assert.equal(r.eligibilityStatus, 'INELIGIBLE');
    assert.equal(r.totalSubsidy, 0);
    assert.ok(r.reason.includes('commercial'));
  });

  // 14. subsidyType = 'none'
  test('14 — subsidyType none = no subsidy', () => {
    const r = calculateSubsidy({
      systemSizeKw: 3, subsidyType: 'none', subsidyConfig,
    });
    assert.equal(r.available, false);
    assert.equal(r.subsidyType, 'none');
    assert.equal(r.totalSubsidy, 0);
    assert.equal(r.status, SUBSIDY_ERROR.NO_SUBSIDY);
  });
});

// =============================================================================
// DCR + GIVE_IT_UP
// =============================================================================

describe('Subsidy Engine — DCR / Give It Up', () => {

  // 15. DCR = eligible
  test('15 — DCR panels = ELIGIBLE', () => {
    const r = residential(3, { panelType: 'DCR' });
    assert.equal(r.eligibilityStatus, 'ELIGIBLE');
    assert.equal(r.dcrRequired, true);
  });

  // 16. Non-DCR with subsidy = GIVE_IT_UP
  test('16 — non-DCR panels with subsidy = GIVE_IT_UP', () => {
    const r = residential(3, { panelType: 'non-DCR' });
    assert.equal(r.available, false);
    assert.equal(r.eligibilityStatus, 'GIVE_IT_UP');
    assert.equal(r.totalSubsidy, 0);
    assert.equal(r.dcrRequired, false); // waived
    assert.ok(r.reason.includes('Give It Up'));
  });

  // 17. GIVE_IT_UP preserves system info
  test('17 — GIVE_IT_UP preserves metadata', () => {
    const r = residential(5, { panelType: 'non-DCR' });
    assert.equal(r.eligibilityStatus, 'GIVE_IT_UP');
    assert.equal(r.subsidyType, 'residential');
    assert.equal(r.eligibleCapacityKw, 5);
    assert.equal(r.schemeName, 'PM Surya Ghar: Muft Bijli Yojana');
    assert.ok(r.calculatedAt);
  });

  // GHS non-DCR
  test('GHS non-DCR = GIVE_IT_UP', () => {
    const r = ghsCalc(3, 5, { panelType: 'non-DCR' });
    assert.equal(r.eligibilityStatus, 'GIVE_IT_UP');
    assert.equal(r.totalSubsidy, 0);
  });
});

// =============================================================================
// KERALA STATE SUBSIDY
// =============================================================================

describe('Subsidy Engine — Kerala', () => {

  // 18. Kerala state subsidy = ₹0
  test('18 — Kerala state subsidy = ₹0', () => {
    const r = residential(3);
    assert.equal(r.stateSubsidy, 0);
    assert.equal(r.centralSubsidy, 78000);
    assert.equal(r.totalSubsidy, 78000); // central only
    assert.ok(r.assumptions.subsidyBasis.includes('CENTRAL_CFA_ONLY'));
  });
});

// =============================================================================
// MAXIMUM CAP
// =============================================================================

describe('Subsidy Engine — Cap', () => {

  // 19. Maximum residential cap verification
  test('19 — cap never exceeded for any size 1-10', () => {
    for (let kw = 1; kw <= 10; kw++) {
      const r = residential(kw);
      assert.ok(r.totalSubsidy <= 78000, `${kw} kW should not exceed ₹78,000`);
      assert.equal(r.eligibilityStatus, 'ELIGIBLE');
    }
  });
});

// =============================================================================
// DETERMINISM
// =============================================================================

describe('Subsidy Engine — Determinism', () => {

  // 20. Same inputs → same output (except calculatedAt)
  test('20 — deterministic output', () => {
    const a = residential(3);
    const b = residential(3);
    // Compare everything except calculatedAt
    assert.equal(a.totalSubsidy, b.totalSubsidy);
    assert.equal(a.centralSubsidy, b.centralSubsidy);
    assert.equal(a.eligibilityStatus, b.eligibilityStatus);
    assert.equal(a.subsidyType, b.subsidyType);
    assert.equal(a.engineVersion, b.engineVersion);
    assert.equal(a.source, b.source);
    assert.equal(a.schemeName, b.schemeName);
  });
});

// =============================================================================
// SOURCE SCANS
// =============================================================================

describe('Subsidy Engine — Source scans', () => {

  // 21. No pricing in source
  test('21 — no pricing/cost/margin in engine source', () => {
    assert.ok(!ENGINE_SRC.includes('customerPrice'), 'no customerPrice');
    assert.ok(!ENGINE_SRC.includes('grandTotal'), 'no grandTotal');
    assert.ok(!ENGINE_SRC.includes('marginPercent'), 'no marginPercent');
    assert.ok(!ENGINE_SRC.includes('sellingPrice'), 'no sellingPrice');
    assert.ok(!ENGINE_SRC.includes('procurementCost'), 'no procurementCost');
  });

  // 22. No BOM in source
  test('22 — no BOM access in engine source', () => {
    assert.ok(!ENGINE_SRC.includes('bomSnapshot'), 'no bomSnapshot');
    assert.ok(!ENGINE_SRC.includes('bomLines'), 'no bomLines');
    assert.ok(!ENGINE_SRC.includes('server-bom'), 'no server-bom');
  });

  // 23. No procurement in source
  test('23 — no procurement access in engine source', () => {
    assert.ok(!ENGINE_SRC.includes('procurement'), 'no procurement');
    assert.ok(!ENGINE_SRC.includes('landedCost'), 'no landedCost');
    assert.ok(!ENGINE_SRC.includes('supplierPrice'), 'no supplierPrice');
  });

  // 33. No savings engine access
  test('33 — no savings engine access', () => {
    assert.ok(!ENGINE_SRC.includes('monthlySavings'), 'no monthlySavings');
    assert.ok(!ENGINE_SRC.includes('annualSavings'), 'no annualSavings');
    assert.ok(!ENGINE_SRC.includes('averageTariffRate'), 'no averageTariffRate');
    assert.ok(!ENGINE_SRC.includes('savingsEngine'), 'no savingsEngine import');
  });
});

// =============================================================================
// SCHEME VERSION + CALCULATED AT
// =============================================================================

describe('Subsidy Engine — Metadata', () => {

  // 24. Scheme version present
  test('24 — scheme version present', () => {
    const r = residential(3);
    assert.equal(r.schemeVersion, 'PMSG_2024_V1');
    assert.equal(r.schemeName, 'PM Surya Ghar: Muft Bijli Yojana');
  });

  // 25. calculatedAt is ISO timestamp
  test('25 — calculatedAt is ISO timestamp', () => {
    const r = residential(3);
    assert.ok(r.calculatedAt);
    assert.ok(!isNaN(new Date(r.calculatedAt).getTime()), 'valid ISO date');
  });

  // 32. Engine version
  test('32 — engine version is 1.0.0', () => {
    assert.equal(SUBSIDY_ENGINE_VERSION, '1.0.0');
    const r = residential(3);
    assert.equal(r.engineVersion, '1.0.0');
  });
});

// =============================================================================
// SNAPSHOT IMMUTABILITY
// =============================================================================

describe('Subsidy Engine — Snapshot', () => {

  // 26. Result is a plain object (serializable, freezable)
  test('26 — result is serializable (JSON round-trip)', () => {
    const r = residential(3);
    const json = JSON.stringify(r);
    const parsed = JSON.parse(json);
    assert.equal(parsed.totalSubsidy, 78000);
    assert.equal(parsed.eligibilityStatus, 'ELIGIBLE');
    assert.equal(parsed.schemeName, 'PM Surya Ghar: Muft Bijli Yojana');
    assert.equal(parsed.schemeVersion, 'PMSG_2024_V1');
    assert.ok(parsed.calculatedAt);
  });
});

// =============================================================================
// OUTPUT CONTRACT
// =============================================================================

describe('Subsidy Engine — Output contract', () => {

  // 27. All required fields present for eligible result
  test('27 — eligible result has all required fields', () => {
    const r = residential(3);
    const requiredFields = [
      'source', 'status', 'available', 'engineVersion', 'treatment',
      'subsidyType', 'eligibleCapacityKw',
      'centralSubsidy', 'stateSubsidy', 'totalSubsidy', 'subsidyAmount',
      'eligibilityStatus', 'eligibilityReason', 'dcrRequired',
      'schemeName', 'schemeVersion', 'calculatedAt',
      'postSubsidyInvestment', 'assumptions',
    ];
    for (const field of requiredFields) {
      assert.ok(field in r, `missing field: ${field}`);
    }
    assert.equal(r.source, 'SUBSIDY_ENGINE');
    assert.equal(r.status, 'LIVE');
    assert.equal(r.available, true);
    assert.equal(r.treatment, 'ENGINE_RESULT');
    assert.equal(r.postSubsidyInvestment, null);
  });

  // Ineligible result has required fields
  test('ineligible result has required fields', () => {
    const r = residential(11);
    assert.equal(r.source, 'SUBSIDY_ENGINE');
    assert.equal(r.available, false);
    assert.equal(r.eligibilityStatus, 'INELIGIBLE');
    assert.equal(r.totalSubsidy, 0);
    assert.ok(r.reason);
  });

  // GHS result has GHS-specific fields
  test('GHS result has ghsHouses and ghsTotalEligibleKw', () => {
    const r = ghsCalc(3, 10);
    assert.equal(r.ghsHouses, 10);
    assert.equal(r.ghsTotalEligibleKw, 30);
    assert.equal(r.subsidyType, 'ghs');
  });
});

// =============================================================================
// MOCK PROVIDER COMPATIBILITY
// =============================================================================

describe('Subsidy Engine — Mock compatibility', () => {

  // 28. Engine result has subsidyAmount field (mock provider compat)
  test('28 — subsidyAmount alias matches totalSubsidy', () => {
    const r = residential(3);
    assert.equal(r.subsidyAmount, r.totalSubsidy);
    assert.equal(r.subsidyAmount, 78000);
  });

  test('subsidyAmount = 0 for ineligible', () => {
    const r = residential(11);
    assert.equal(r.subsidyAmount, 0);
  });

  test('treatment = ENGINE_RESULT for eligible', () => {
    const r = residential(3);
    assert.equal(r.treatment, 'ENGINE_RESULT');
  });
});

// =============================================================================
// CONFIG VALIDATION
// =============================================================================

describe('Subsidy Engine — Config validation', () => {

  // 29. Valid config
  test('29 — valid config passes', () => {
    const v = validateSubsidyConfig(subsidyConfig);
    assert.equal(v.valid, true);
    assert.equal(v.errors.length, 0);
  });

  // 30. Null config
  test('30 — null config fails', () => {
    const v = validateSubsidyConfig(null);
    assert.equal(v.valid, false);
  });

  // 31. Missing sections
  test('31 — missing residential section', () => {
    const v = validateSubsidyConfig({ ghs: subsidyConfig.ghs, scheme: subsidyConfig.scheme });
    assert.equal(v.valid, false);
    assert.ok(v.errors.some(e => e.includes('residential')));
  });

  test('missing GHS section', () => {
    const v = validateSubsidyConfig({ residential: subsidyConfig.residential, scheme: subsidyConfig.scheme });
    assert.equal(v.valid, false);
    assert.ok(v.errors.some(e => e.includes('GHS')));
  });

  // Missing config → blocked
  test('missing subsidyConfig → blocked result', () => {
    const r = calculateSubsidy({ systemSizeKw: 3, subsidyType: 'residential' });
    assert.equal(r.available, false);
    assert.equal(r.status, SUBSIDY_ERROR.MISSING_CONFIG);
  });
});

// =============================================================================
// EDGE CASES
// =============================================================================

describe('Subsidy Engine — Edge cases', () => {

  // 35. Upgrade ambiguity — engine just calculates based on kW passed
  test('35 — engine calculates based on systemSizeKw passed (upgrade neutral)', () => {
    // Engine doesn't know about upgrades — caller decides kW basis
    const r = residential(2); // upgrade delta of 2kW
    assert.equal(r.totalSubsidy, 60000);
    assert.equal(r.eligibilityStatus, 'ELIGIBLE');
  });

  // 36. Rounding — all amounts whole rupees
  test('36 — amounts are whole rupees', () => {
    for (const kw of [1, 1.5, 2, 2.5, 3, 4, 5, 10]) {
      const r = residential(kw);
      if (r.available) {
        assert.equal(r.centralSubsidy % 1, 0, `${kw} kW centralSubsidy should be integer`);
        assert.equal(r.totalSubsidy % 1, 0, `${kw} kW totalSubsidy should be integer`);
      }
    }
  });

  // Unknown subsidy type
  test('unknown subsidyType = blocked', () => {
    const r = calculateSubsidy({
      systemSizeKw: 3, subsidyType: 'industrial', subsidyConfig,
    });
    assert.equal(r.available, false);
    assert.equal(r.status, SUBSIDY_ERROR.INVALID_INPUT);
  });

  // Null system size
  test('null systemSizeKw = blocked', () => {
    const r = calculateSubsidy({
      systemSizeKw: null, subsidyType: 'residential', subsidyConfig,
    });
    assert.equal(r.available, false);
    assert.equal(r.status, SUBSIDY_ERROR.INVALID_INPUT);
  });

  // String system size
  test('string systemSizeKw = blocked', () => {
    const r = calculateSubsidy({
      systemSizeKw: '3', subsidyType: 'residential', subsidyConfig,
    });
    assert.equal(r.available, false);
    assert.equal(r.status, SUBSIDY_ERROR.INVALID_INPUT);
  });

  // No arguments
  test('no arguments = no subsidy (defaults to none-like)', () => {
    const r = calculateSubsidy();
    assert.equal(r.available, false);
  });

  // Below minimum capacity
  test('0.5 kW below min 1 kW = INELIGIBLE', () => {
    const r = residential(0.5);
    assert.equal(r.available, false);
    assert.equal(r.eligibilityStatus, 'INELIGIBLE');
    assert.ok(r.reason.includes('below minimum'));
  });

  // Exactly 10 kW (boundary)
  test('exactly 10 kW = ELIGIBLE (boundary)', () => {
    const r = residential(10);
    assert.equal(r.available, true);
    assert.equal(r.eligibilityStatus, 'ELIGIBLE');
  });

  // 10.001 kW (just over)
  test('10.001 kW = INELIGIBLE (just over boundary)', () => {
    const r = residential(10.001);
    assert.equal(r.available, false);
    assert.equal(r.eligibilityStatus, 'INELIGIBLE');
  });
});
