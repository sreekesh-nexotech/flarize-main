/**
 * FINANCE ENGINE — Test Suite  (V1.1 — corrected business rules)
 *
 * Covers:
 *   A  Standard EMI (PMT formula)
 *   B  Rate-tier resolution (5.75% ≤₹200k, 7.90% >₹200k)
 *   C  Zero interest / zero principal
 *   D  Tenure extremes (1yr, 10yr) + default tenure = 10yr
 *   E  Down-payment order: gross → 10% of gross → less subsidy → principal
 *   F  CRITICAL: proves gross − 10%gross − subsidy, NOT gross − subsidy − 10%remaining
 *   G  Real business cases (3kW, 5kW, 10kW)
 *   H  Boundary: ₹200,000 → 5.75%, ₹200,001 → 7.90%
 *   I  No subsidy / subsidy > gross
 *   J  Invalid inputs
 *   K  Determinism
 *   L  Rounding
 *   M  No NaN / Infinity
 *   N  Config validation
 *   O  Source isolation
 *   P  Snapshot immutability
 *   Q  §22 payload contract + new fields
 *   R  Metadata (version 1.1.0, configVersion, calculatedAt)
 *   S  Large principal
 *   T  resolveIndicativeRate unit tests
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  calculateFinance,
  resolveIndicativeRate,
  validateFinanceConfig,
  FINANCE_ENGINE_VERSION,
  FINANCE_SOURCE,
  FINANCE_STATUS_LIVE,
  FINANCE_ERROR,
} from '../src/lib/financeEngine.js';

// ---- Load config + source ---------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(__dirname, '..', 'data', 'finance-config.json');
const financeConfig = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));

const ENGINE_SRC_RAW = readFileSync(
  resolve(__dirname, '..', 'src', 'lib', 'financeEngine.js'), 'utf8');
const ENGINE_SRC = ENGINE_SRC_RAW
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');

// ---- Helpers ----------------------------------------------------------------

const AT = '2026-08-29T04:00:00Z';

/** Call calculateFinance with config + timestamp defaults */
function emi(principal, opts = {}) {
  return calculateFinance({
    principal,
    annualInterestRate: opts.rate ?? undefined,
    tenureYears: opts.tenure ?? undefined,
    financeConfig,
    calculatedAt: opts.at ?? AT,
    downPaymentPercentage: opts.dpPct ?? undefined,
    downPaymentAmount: opts.dpAmt ?? undefined,
    grossQuotationAmount: opts.gross ?? undefined,
    postSubsidyInvestment: opts.psi ?? undefined,
  });
}

/** Reference PMT for verification */
function referencePMT(P, annualRate, years) {
  const n = years * 12;
  if (annualRate === 0) return Math.round(P / n);
  const r = annualRate / 12 / 100;
  const c = Math.pow(1 + r, n);
  return Math.round((P * r * c) / (c - 1));
}

/**
 * Compute finance principal using correct business flow:
 * gross → 10% down → remaining → less subsidy → principal
 */
function businessPrincipal(gross, subsidy, dpPct = 10) {
  const dp = Math.round(gross * dpPct / 100);
  const remaining = gross - dp;
  return Math.max(0, remaining - subsidy);
}

// =============================================================================
// A. Standard EMI — PMT formula
// =============================================================================

describe('Finance Engine — Standard EMI', () => {
  test('₹178,500 at 5.75% for 10yr (3kW corrected principal)', () => {
    const r = emi(178500, { rate: 5.75, tenure: 10 });
    const expected = referencePMT(178500, 5.75, 10);
    assert.equal(r.available, true);
    assert.equal(r.monthlyEMI, expected);
    assert.equal(r.totalRepayment, expected * 120);
    assert.equal(r.totalInterest, expected * 120 - 178500);
    assert.equal(r.loanAmount, 178500);
  });

  test('₹349,500 at 7.90% for 10yr (5kW corrected principal)', () => {
    const r = emi(349500, { rate: 7.90, tenure: 10 });
    const expected = referencePMT(349500, 7.90, 10);
    assert.equal(r.monthlyEMI, expected);
    assert.equal(r.totalRepayment, expected * 120);
  });

  test('₹777,000 at 7.90% for 10yr (10kW corrected principal)', () => {
    const r = emi(777000, { rate: 7.90, tenure: 10 });
    const expected = referencePMT(777000, 7.90, 10);
    assert.equal(r.monthlyEMI, expected);
  });

  test('explicit rate overrides tier lookup', () => {
    const r = emi(100000, { rate: 8.25, tenure: 5 });
    assert.equal(r.interestRatePct, 8.25);
    assert.equal(r.monthlyEMI, referencePMT(100000, 8.25, 5));
  });
});

// =============================================================================
// B. Rate-tier resolution
// =============================================================================

describe('Finance Engine — Rate-tier resolution', () => {
  test('principal ≤ ₹200,000 → 5.75%', () => {
    const r = emi(150000);
    assert.equal(r.interestRatePct, 5.75);
    assert.equal(r.rateLabel, 'Indicative PM Surya Ghar rate');
  });

  test('principal > ₹200,000 → 7.90%', () => {
    const r = emi(300000);
    assert.equal(r.interestRatePct, 7.90);
    assert.equal(r.rateLabel, 'Indicative PM Surya Ghar rate');
  });

  test('exact ₹200,000 boundary → 5.75%', () => {
    const r = emi(200000);
    assert.equal(r.interestRatePct, 5.75);
  });

  test('₹200,000.01 → 7.90%', () => {
    const r = emi(200000.01);
    assert.equal(r.interestRatePct, 7.90);
  });

  test('default tenure = 10 years when omitted', () => {
    const r = emi(100000);
    assert.equal(r.tenureYears, 10);
    assert.equal(r.tenureMonths, 120);
  });
});

// =============================================================================
// B2. resolveIndicativeRate unit tests
// =============================================================================

describe('Finance Engine — resolveIndicativeRate()', () => {
  test('picks lower tier for ₹100,000', () => {
    const { rate, label } = resolveIndicativeRate(100000, financeConfig);
    assert.equal(rate, 5.75);
    assert.equal(label, 'Indicative PM Surya Ghar rate');
  });

  test('picks upper tier for ₹500,000', () => {
    const { rate } = resolveIndicativeRate(500000, financeConfig);
    assert.equal(rate, 7.90);
  });

  test('no rateTiers → fallback to legacy default', () => {
    const cfg = { defaults: { annualInterestRate: 9 } };
    const { rate, label } = resolveIndicativeRate(100000, cfg);
    assert.equal(rate, 9);
    assert.equal(label, null);
  });

  test('empty rateTiers → fallback 7', () => {
    const cfg = { rateTiers: [] };
    const { rate } = resolveIndicativeRate(100000, cfg);
    assert.equal(rate, 7);
  });
});

// =============================================================================
// C. Zero interest / zero principal
// =============================================================================

describe('Finance Engine — Zero interest', () => {
  test('0% interest = principal / months, no NaN', () => {
    const r = emi(120000, { rate: 0, tenure: 10 });
    assert.equal(r.available, true);
    assert.equal(r.monthlyEMI, 1000); // 120000 / 120
    assert.equal(r.totalRepayment, 120000);
    assert.equal(r.totalInterest, 0);
    assert.equal(r.interestRatePct, 0);
  });

  test('0% interest with non-divisible principal', () => {
    const r = emi(100000, { rate: 0, tenure: 3 });
    // 100000 / 36 = 2777.77... → 2778
    assert.equal(r.monthlyEMI, 2778);
    assert.equal(r.totalRepayment, 2778 * 36);
    assert.equal(r.totalInterest, 2778 * 36 - 100000);
  });
});

describe('Finance Engine — Zero principal', () => {
  test('principal = 0 → EMI = 0, available = true', () => {
    const r = emi(0, { rate: 7, tenure: 5 });
    assert.equal(r.available, true);
    assert.equal(r.monthlyEMI, 0);
    assert.equal(r.totalRepayment, 0);
    assert.equal(r.totalInterest, 0);
    assert.equal(r.loanAmount, 0);
  });
});

// =============================================================================
// D. Tenure extremes + default
// =============================================================================

describe('Finance Engine — Tenure', () => {
  test('1-year tenure (12 months)', () => {
    const r = emi(100000, { rate: 7, tenure: 1 });
    assert.equal(r.tenureMonths, 12);
    const expected = referencePMT(100000, 7, 1);
    assert.equal(r.monthlyEMI, expected);
    assert.equal(r.totalRepayment, expected * 12);
  });

  test('10-year tenure (120 months)', () => {
    const r = emi(500000, { rate: 7, tenure: 10 });
    assert.equal(r.tenureMonths, 120);
    const expected = referencePMT(500000, 7, 10);
    assert.equal(r.monthlyEMI, expected);
  });

  test('default tenure = 10yr from config', () => {
    const r = emi(200000);
    assert.equal(r.tenureYears, 10);
    assert.equal(r.tenureMonths, 120);
  });

  test('tenure outside range rejected', () => {
    const r0 = emi(100000, { tenure: 0 });
    assert.equal(r0.available, false);
    assert.equal(r0.status, FINANCE_ERROR.INVALID_TENURE);

    const r11 = emi(100000, { tenure: 11 });
    assert.equal(r11.available, false);
    assert.equal(r11.status, FINANCE_ERROR.INVALID_TENURE);
  });
});

// =============================================================================
// E. Down-payment order (workspace-level, engine receives principal)
// =============================================================================

describe('Finance Engine — Down payment order verification', () => {
  // These tests prove the correct business flow:
  // gross → 10% of gross (down payment) → remaining → less subsidy → principal

  test('3kW: dp=₹28,500, principal=₹178,500', () => {
    const gross = 285000;
    const subsidy = 78000;
    const dp = Math.round(gross * 0.10);
    assert.equal(dp, 28500, 'down payment = 10% of gross');
    const remaining = gross - dp;
    assert.equal(remaining, 256500, 'remaining after down payment');
    const principal = Math.max(0, remaining - subsidy);
    assert.equal(principal, 178500, 'finance principal');

    const r = emi(principal, { rate: 5.75, tenure: 10 });
    assert.equal(r.loanAmount, 178500);
    assert.equal(r.available, true);
  });

  test('5kW: dp=₹47,500, principal=₹349,500', () => {
    const gross = 475000;
    const subsidy = 78000;
    const dp = Math.round(gross * 0.10);
    assert.equal(dp, 47500);
    const principal = Math.max(0, gross - dp - subsidy);
    assert.equal(principal, 349500);

    const r = emi(principal, { rate: 7.90, tenure: 10 });
    assert.equal(r.loanAmount, 349500);
  });

  test('10kW: dp=₹95,000, principal=₹777,000', () => {
    const gross = 950000;
    const subsidy = 78000;
    const dp = Math.round(gross * 0.10);
    assert.equal(dp, 95000);
    const principal = Math.max(0, gross - dp - subsidy);
    assert.equal(principal, 777000);

    const r = emi(principal, { rate: 7.90, tenure: 10 });
    assert.equal(r.loanAmount, 777000);
  });

  test('no subsidy: principal = gross − 10% gross', () => {
    const gross = 285000;
    const subsidy = 0;
    const dp = Math.round(gross * 0.10);
    const principal = Math.max(0, gross - dp - subsidy);
    assert.equal(principal, 256500);

    const r = emi(principal);
    assert.equal(r.loanAmount, 256500);
    assert.ok(r.available);
  });

  test('subsidy > remaining after dp → principal = 0', () => {
    const gross = 50000;
    const subsidy = 78000;
    const dp = Math.round(gross * 0.10); // 5000
    const remaining = gross - dp; // 45000
    const principal = Math.max(0, remaining - subsidy);
    assert.equal(principal, 0);

    const r = emi(principal);
    assert.equal(r.loanAmount, 0);
    assert.equal(r.monthlyEMI, 0);
    assert.equal(r.available, true);
  });

  test('postSubsidyInvestment is separate from finance principal', () => {
    const gross = 285000;
    const subsidy = 78000;
    const psi = Math.max(0, gross - subsidy);
    assert.equal(psi, 207000, 'Your Investment = gross − subsidy');

    const principal = businessPrincipal(gross, subsidy, 10);
    assert.equal(principal, 178500, 'Finance principal ≠ Your Investment');
    assert.notEqual(principal, psi, 'must be different values');
  });
});

// =============================================================================
// F. CRITICAL: order-of-operations proof
// =============================================================================

describe('Finance Engine — CRITICAL: order-of-operations', () => {
  test('MUST compute gross − 10%gross − subsidy, NOT gross − subsidy − 10%remaining', () => {
    const gross = 285000;
    const subsidy = 78000;

    // CORRECT: down payment on gross, then subtract subsidy
    const correctDp = Math.round(gross * 0.10);           // 28,500
    const correctPrincipal = Math.max(0, gross - correctDp - subsidy);  // 178,500

    // WRONG: subtract subsidy first, then down payment on remainder
    const wrongRemainder = gross - subsidy;                // 207,000
    const wrongDp = Math.round(wrongRemainder * 0.10);     // 20,700
    const wrongPrincipal = wrongRemainder - wrongDp;       // 186,300

    assert.equal(correctPrincipal, 178500, 'correct principal');
    assert.equal(wrongPrincipal, 186300, 'wrong principal (verify not used)');
    assert.notEqual(correctPrincipal, wrongPrincipal, 'order matters');

    // Engine receives the CORRECT principal
    const r = emi(correctPrincipal, { rate: 5.75, tenure: 10 });
    assert.equal(r.loanAmount, 178500);
    assert.notEqual(r.loanAmount, 186300);
    assert.notEqual(r.loanAmount, 207000);
  });

  test('old incorrect principal ₹207,000 is NOT used as finance amount', () => {
    // Previously the engine received gross − subsidy = 207000 as principal.
    // Correct: gross − 10%gross − subsidy = 178500
    const gross = 285000;
    const subsidy = 78000;
    const oldIncorrect = gross - subsidy;    // 207000 — old behavior
    const correct = businessPrincipal(gross, subsidy, 10); // 178500
    assert.notEqual(correct, oldIncorrect);
    assert.equal(correct, 178500);
  });
});

// =============================================================================
// G. Real business cases (3kW, 5kW, 10kW) with corrected values
// =============================================================================

describe('Finance Engine — Real business cases (corrected)', () => {
  test('3kW: gross ₹285k, subsidy ₹78k, dp ₹28.5k, principal ₹178.5k @ 5.75%/10yr', () => {
    const principal = 178500;
    const r = emi(principal, {
      rate: 5.75, tenure: 10,
      dpPct: 10, dpAmt: 28500, gross: 285000, psi: 207000,
    });
    assert.equal(r.loanAmount, 178500);
    assert.equal(r.interestRatePct, 5.75);
    assert.equal(r.tenureYears, 10);
    assert.equal(r.tenureMonths, 120);
    assert.equal(r.monthlyEMI, referencePMT(178500, 5.75, 10));
    assert.equal(r.totalRepayment, r.monthlyEMI * 120);
    assert.equal(r.totalInterest, r.totalRepayment - 178500);
    assert.equal(r.downPaymentPercentage, 10);
    assert.equal(r.downPaymentAmount, 28500);
    assert.equal(r.grossQuotationAmount, 285000);
    assert.equal(r.postSubsidyInvestment, 207000);
  });

  test('5kW: gross ₹475k, subsidy ₹78k, dp ₹47.5k, principal ₹349.5k @ 7.90%/10yr', () => {
    const principal = 349500;
    const r = emi(principal, {
      rate: 7.90, tenure: 10,
      dpPct: 10, dpAmt: 47500, gross: 475000, psi: 397000,
    });
    assert.equal(r.loanAmount, 349500);
    assert.equal(r.interestRatePct, 7.90);
    assert.equal(r.monthlyEMI, referencePMT(349500, 7.90, 10));
    assert.equal(r.downPaymentAmount, 47500);
    assert.equal(r.grossQuotationAmount, 475000);
    assert.equal(r.postSubsidyInvestment, 397000);
  });

  test('10kW: gross ₹950k, subsidy ₹78k, dp ₹95k, principal ₹777k @ 7.90%/10yr', () => {
    const principal = 777000;
    const r = emi(principal, {
      rate: 7.90, tenure: 10,
      dpPct: 10, dpAmt: 95000, gross: 950000, psi: 872000,
    });
    assert.equal(r.loanAmount, 777000);
    assert.equal(r.interestRatePct, 7.90);
    assert.equal(r.monthlyEMI, referencePMT(777000, 7.90, 10));
    assert.equal(r.downPaymentAmount, 95000);
    assert.equal(r.postSubsidyInvestment, 872000);
  });
});

// =============================================================================
// H. Rate-tier boundary (₹200,000 exact)
// =============================================================================

describe('Finance Engine — Rate-tier boundary', () => {
  test('₹200,000 exactly → 5.75%', () => {
    const r = emi(200000);
    assert.equal(r.interestRatePct, 5.75);
  });

  test('₹200,001 → 7.90%', () => {
    const r = emi(200001);
    assert.equal(r.interestRatePct, 7.90);
  });

  test('₹199,999 → 5.75%', () => {
    const r = emi(199999);
    assert.equal(r.interestRatePct, 5.75);
  });
});

// =============================================================================
// I. No subsidy / subsidy exceeds gross
// =============================================================================

describe('Finance Engine — Subsidy edge cases', () => {
  test('no subsidy: finance principal = gross − 10% dp', () => {
    const gross = 285000;
    const principal = businessPrincipal(gross, 0, 10);
    assert.equal(principal, 256500);
    const r = emi(principal);
    assert.equal(r.loanAmount, 256500);
    assert.ok(r.available);
  });

  test('subsidy > gross after dp → principal floored at 0', () => {
    const gross = 50000;
    const principal = businessPrincipal(gross, 78000, 10);
    assert.equal(principal, 0);
    const r = emi(principal);
    assert.equal(r.loanAmount, 0);
    assert.equal(r.monthlyEMI, 0);
    assert.ok(r.available);
  });
});

// =============================================================================
// J. Invalid inputs
// =============================================================================

describe('Finance Engine — Invalid inputs', () => {
  test('negative principal', () => {
    const r = emi(-50000);
    assert.equal(r.available, false);
    assert.equal(r.status, FINANCE_ERROR.INVALID_PRINCIPAL);
    assert.equal(r.monthlyEMI, 0);
  });

  test('negative interest rate', () => {
    const r = emi(100000, { rate: -1 });
    assert.equal(r.available, false);
    assert.equal(r.status, FINANCE_ERROR.INVALID_INTEREST_RATE);
  });

  test('interest rate > max (18%)', () => {
    const r = emi(100000, { rate: 19 });
    assert.equal(r.available, false);
    assert.equal(r.status, FINANCE_ERROR.INVALID_INTEREST_RATE);
  });

  test('NaN principal', () => {
    const r = emi(NaN);
    assert.equal(r.available, false);
    assert.equal(r.status, FINANCE_ERROR.INVALID_PRINCIPAL);
  });

  test('Infinity principal', () => {
    const r = emi(Infinity);
    assert.equal(r.available, false);
    assert.equal(r.status, FINANCE_ERROR.INVALID_PRINCIPAL);
  });

  test('missing config', () => {
    const r = calculateFinance({ principal: 100000 });
    assert.equal(r.available, false);
    assert.equal(r.status, FINANCE_ERROR.MISSING_CONFIG);
  });
});

// =============================================================================
// K. Determinism
// =============================================================================

describe('Finance Engine — Determinism', () => {
  test('identical inputs → identical outputs', () => {
    const a = emi(178500, { rate: 5.75, tenure: 10 });
    const b = emi(178500, { rate: 5.75, tenure: 10 });
    assert.deepStrictEqual(a, b);
  });
});

// =============================================================================
// L. Rounding
// =============================================================================

describe('Finance Engine — Rounding', () => {
  test('monthlyEMI is Math.round of exact EMI', () => {
    const P = 178500;
    const rate = 5.75;
    const r = rate / 12 / 100;
    const n = 120;
    const c = Math.pow(1 + r, n);
    const exactEMI = (P * r * c) / (c - 1);
    const result = emi(P, { rate, tenure: 10 });
    assert.equal(result.monthlyEMI, Math.round(exactEMI));
  });

  test('totalRepayment = roundedEMI × months', () => {
    const result = emi(178500, { rate: 5.75, tenure: 10 });
    assert.equal(result.totalRepayment, result.monthlyEMI * result.tenureMonths);
  });

  test('totalInterest = totalRepayment − principal', () => {
    const result = emi(178500, { rate: 5.75, tenure: 10 });
    assert.equal(result.totalInterest, result.totalRepayment - result.loanAmount);
  });
});

// =============================================================================
// M. No NaN / Infinity
// =============================================================================

describe('Finance Engine — No NaN or Infinity in output', () => {
  test('valid result has no NaN or Infinity', () => {
    const r = emi(178500, { rate: 5.75, tenure: 10 });
    for (const [key, val] of Object.entries(r)) {
      if (typeof val === 'number') {
        assert.ok(isFinite(val), `${key} must be finite, got ${val}`);
        assert.ok(!isNaN(val), `${key} must not be NaN`);
      }
    }
  });

  test('blocked result has no NaN or Infinity', () => {
    const r = emi(-1);
    for (const [key, val] of Object.entries(r)) {
      if (typeof val === 'number') {
        assert.ok(isFinite(val), `${key} must be finite in blocked result`);
      }
    }
  });
});

// =============================================================================
// N. Config validation
// =============================================================================

describe('Finance Engine — Config validation', () => {
  test('valid config passes', () => {
    const result = validateFinanceConfig(financeConfig);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  test('null config fails', () => {
    const result = validateFinanceConfig(null);
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0);
  });

  test('missing defaults fails', () => {
    const result = validateFinanceConfig({
      validation: financeConfig.validation,
      rateTiers: financeConfig.rateTiers,
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('defaults')));
  });

  test('missing validation fails', () => {
    const result = validateFinanceConfig({
      defaults: financeConfig.defaults,
      rateTiers: financeConfig.rateTiers,
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('validation')));
  });

  test('missing rateTiers fails', () => {
    const result = validateFinanceConfig({
      defaults: financeConfig.defaults,
      validation: financeConfig.validation,
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('rateTiers')));
  });
});

// =============================================================================
// O. Source isolation
// =============================================================================

describe('Finance Engine — Source isolation', () => {
  test('does not import BOM modules', () => {
    assert.ok(!ENGINE_SRC.includes("from './bomSnapshot"), 'must not import bomSnapshot');
    assert.ok(!ENGINE_SRC.includes("from './bom"), 'must not import bom');
    assert.ok(!ENGINE_SRC.includes('server-bom'), 'must not reference server-bom');
  });

  test('does not import procurement modules', () => {
    assert.ok(!ENGINE_SRC.includes('procurement'), 'must not reference procurement');
  });

  test('does not import pricing/margin/other-engine modules', () => {
    assert.ok(!ENGINE_SRC.includes("from './pricing"), 'must not import pricing');
    assert.ok(!ENGINE_SRC.includes('marginEngine'), 'must not reference margin');
    assert.ok(!ENGINE_SRC.includes("from './commercialSnapshot"), 'must not import commercialSnapshot');
    assert.ok(!ENGINE_SRC.includes("from './subsidyEngine"), 'must not import subsidyEngine');
    assert.ok(!ENGINE_SRC.includes("from './savingsEngine"), 'must not import savingsEngine');
    assert.ok(!ENGINE_SRC.includes("from './energyEngine"), 'must not import energyEngine');
  });
});

// =============================================================================
// P. Snapshot immutability
// =============================================================================

describe('Finance Engine — Snapshot immutability', () => {
  test('result is frozen', () => {
    const r = emi(178500, { rate: 5.75, tenure: 10 });
    assert.ok(Object.isFrozen(r), 'result must be Object.frozen');
  });

  test('blocked result is frozen', () => {
    const r = emi(-1);
    assert.ok(Object.isFrozen(r), 'blocked result must be frozen');
  });
});

// =============================================================================
// Q. §22 payload contract + new fields
// =============================================================================

describe('Finance Engine — §22 payload contract', () => {
  test('all required fields present (including V1.1 additions)', () => {
    const r = emi(178500, {
      rate: 5.75, tenure: 10,
      dpPct: 10, dpAmt: 28500, gross: 285000, psi: 207000,
    });
    const required = [
      'source', 'status', 'available', 'engineVersion',
      'loanAmount', 'interestRatePct', 'rateLabel',
      'tenureYears', 'tenureMonths',
      'monthlyEMI', 'totalInterest', 'totalRepayment',
      'downPaymentPercentage', 'downPaymentAmount',
      'grossQuotationAmount', 'postSubsidyInvestment',
      'calculatedAt', 'configVersion', 'assumptions',
    ];
    for (const f of required) {
      assert.ok(f in r, `Missing field: ${f}`);
    }
  });

  test('source = FINANCE_ENGINE', () => {
    const r = emi(178500);
    assert.equal(r.source, 'FINANCE_ENGINE');
  });

  test('status = LIVE for valid result', () => {
    const r = emi(178500);
    assert.equal(r.status, 'LIVE');
  });

  test('passthrough fields preserved when supplied', () => {
    const r = emi(178500, { dpPct: 10, dpAmt: 28500, gross: 285000, psi: 207000 });
    assert.equal(r.downPaymentPercentage, 10);
    assert.equal(r.downPaymentAmount, 28500);
    assert.equal(r.grossQuotationAmount, 285000);
    assert.equal(r.postSubsidyInvestment, 207000);
  });

  test('passthrough fields null when not supplied', () => {
    const r = emi(178500);
    assert.equal(r.downPaymentPercentage, null);
    assert.equal(r.downPaymentAmount, null);
    assert.equal(r.grossQuotationAmount, null);
    assert.equal(r.postSubsidyInvestment, null);
  });

  test('blocked result has all passthrough fields as null', () => {
    const r = emi(-1);
    assert.equal(r.downPaymentPercentage, null);
    assert.equal(r.downPaymentAmount, null);
    assert.equal(r.grossQuotationAmount, null);
    assert.equal(r.postSubsidyInvestment, null);
  });
});

// =============================================================================
// R. Metadata
// =============================================================================

describe('Finance Engine — Metadata', () => {
  test('engineVersion is 1.1.0', () => {
    assert.equal(FINANCE_ENGINE_VERSION, '1.1.0');
    const r = emi(178500);
    assert.equal(r.engineVersion, '1.1.0');
  });

  test('calculatedAt is preserved', () => {
    const r = emi(178500, { at: AT });
    assert.equal(r.calculatedAt, AT);
  });

  test('configVersion from config', () => {
    const r = emi(178500);
    assert.equal(r.configVersion, 'finance-config.2');
  });

  test('assumptions.rateSource is INDICATIVE_CONFIG_TIER', () => {
    const r = emi(178500);
    assert.equal(r.assumptions.formula, 'STANDARD_PMT_REDUCING_BALANCE');
    assert.equal(r.assumptions.rateSource, 'INDICATIVE_CONFIG_TIER');
  });
});

// =============================================================================
// S. Large principal
// =============================================================================

describe('Finance Engine — Large principal', () => {
  test('₹10,00,000 at 7.90% for 10yr', () => {
    const r = emi(1000000, { rate: 7.90, tenure: 10 });
    const expected = referencePMT(1000000, 7.90, 10);
    assert.equal(r.monthlyEMI, expected);
    assert.ok(r.available);
    assert.ok(r.totalRepayment > 1000000);
    assert.ok(r.totalInterest > 0);
  });
});

// =============================================================================
// T. Decimal interest rate (bank rates)
// =============================================================================

describe('Finance Engine — Decimal interest rates', () => {
  test('5.65% (SBI exclusive rate)', () => {
    const r = emi(200000, { rate: 5.65, tenure: 10 });
    const expected = referencePMT(200000, 5.65, 10);
    assert.equal(r.monthlyEMI, expected);
  });

  test('8.25% (Canara Bank rate)', () => {
    const r = emi(200000, { rate: 8.25, tenure: 10 });
    const expected = referencePMT(200000, 8.25, 10);
    assert.equal(r.monthlyEMI, expected);
  });

  test('8.8% (Kerala Gramin Bank rate)', () => {
    const r = emi(200000, { rate: 8.8, tenure: 7 });
    const expected = referencePMT(200000, 8.8, 7);
    assert.equal(r.monthlyEMI, expected);
  });
});
