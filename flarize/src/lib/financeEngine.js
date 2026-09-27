/**
 * FINANCE ENGINE  (Phase 4, V1.1 — EMI / Loan Calculation)
 *
 * Pure calculation module — standard reducing-balance EMI (PMT formula)
 * with configuration-driven indicative rate tiers.
 *
 * No React, no DOM, no fetch, no pricing, no BOM, no procurement,
 * no subsidy, no savings, no GST, no margin. Zero dependencies beyond
 * JavaScript builtins.
 *
 * EMI formula (standard PMT):
 *   EMI = P × r × (1+r)^n / ((1+r)^n − 1)
 *
 *   P = principal (finance amount after down payment and subsidy)
 *   r = annualInterestRate / 12 / 100  (monthly rate)
 *   n = tenureYears × 12  (months)
 *
 * Zero-interest path:
 *   EMI = P / n
 *
 * Rate resolution:
 *   When annualInterestRate is not explicitly supplied, the engine
 *   resolves it from config.rateTiers based on the principal amount.
 *   Tiers are matched by maxFinanceAmount / minFinanceAmount boundaries.
 *
 * Down payment:
 *   The engine does NOT calculate down payment — that is the workspace's
 *   responsibility. The engine receives the final numeric principal.
 *   Down payment metadata (percentage, amount) may be passed through
 *   for payload inclusion.
 *
 * Rounding:
 *   1. Calculate exact EMI
 *   2. monthlyEMI = Math.round(exactEMI)
 *   3. totalRepayment = monthlyEMI × tenureMonths
 *   4. totalInterest = totalRepayment − principal
 *
 * This module does NOT calculate: subsidy, pricing, quotation price,
 * BOM cost, procurement cost, margin, selling price, GST, savings,
 * down payment amount, or post-subsidy investment. It receives a
 * numeric principal and returns EMI breakdown.
 *
 * @module financeEngine
 */

// ---- Version + constants ----------------------------------------------------

export const FINANCE_ENGINE_VERSION = '1.1.0';
export const FINANCE_SOURCE = 'FINANCE_ENGINE';
export const FINANCE_STATUS_LIVE = 'LIVE';

export const FINANCE_ERROR = Object.freeze({
  INVALID_PRINCIPAL: 'INVALID_PRINCIPAL',
  INVALID_INTEREST_RATE: 'INVALID_INTEREST_RATE',
  INVALID_TENURE: 'INVALID_TENURE',
  MISSING_CONFIG: 'MISSING_CONFIG',
});

// ---- Rate-tier resolution ---------------------------------------------------

/**
 * Resolve the indicative interest rate from config rateTiers based on
 * the finance principal amount.
 *
 * @param {number} principal — finance amount
 * @param {object} financeConfig — parsed finance-config.json
 * @returns {{ rate: number, label: string|null }} resolved rate + label
 */
export function resolveIndicativeRate(principal, financeConfig) {
  const tiers = financeConfig?.rateTiers;
  if (!Array.isArray(tiers) || tiers.length === 0) {
    // Fallback: no tiers configured — use legacy default if present
    const fallback = financeConfig?.defaults?.annualInterestRate ?? 7;
    return { rate: fallback, label: null };
  }

  for (const tier of tiers) {
    const minOk = tier.minFinanceAmount == null || principal >= tier.minFinanceAmount;
    const maxOk = tier.maxFinanceAmount == null || principal <= tier.maxFinanceAmount;
    if (minOk && maxOk) {
      return { rate: tier.annualInterestRate, label: tier.label ?? null };
    }
  }

  // No tier matched — use last tier as fallback
  const last = tiers[tiers.length - 1];
  return { rate: last.annualInterestRate, label: last.label ?? null };
}

// ---- Core calculation -------------------------------------------------------

/**
 * Calculate EMI, total repayment, and total interest.
 *
 * @param {object} params
 * @param {number} params.principal — finance amount (₹). Must be >= 0.
 * @param {number} [params.annualInterestRate] — annual interest rate as percentage (e.g. 7 for 7%). When omitted, resolved from config rateTiers.
 * @param {number} [params.tenureYears] — loan tenure in years. Defaults to config default.
 * @param {object} params.financeConfig — parsed finance-config.json
 * @param {string} [params.calculatedAt] — ISO timestamp, supplied by caller
 * @param {number} [params.downPaymentPercentage] — passthrough for payload (not used in EMI calc)
 * @param {number} [params.downPaymentAmount] — passthrough for payload (not used in EMI calc)
 * @param {number} [params.grossQuotationAmount] — passthrough for payload (not used in EMI calc)
 * @param {number} [params.postSubsidyInvestment] — passthrough for payload (not used in EMI calc)
 * @returns {object} Finance result matching §22 payload contract
 */
export function calculateFinance({
  principal,
  annualInterestRate,
  tenureYears,
  financeConfig,
  calculatedAt,
  downPaymentPercentage,
  downPaymentAmount,
  grossQuotationAmount,
  postSubsidyInvestment,
} = {}) {
  // ---- Config validation ----------------------------------------------------
  if (!financeConfig || typeof financeConfig !== 'object') {
    return blocked(FINANCE_ERROR.MISSING_CONFIG, 'Finance configuration is required.', calculatedAt);
  }

  const defaults = financeConfig.defaults || {};
  const validation = financeConfig.validation || {};

  // Apply defaults
  const tenure = tenureYears ?? defaults.tenureYears ?? 10;
  const ts = calculatedAt ?? new Date().toISOString();

  // ---- Input validation -----------------------------------------------------

  if (principal == null || typeof principal !== 'number' || !isFinite(principal) || principal < 0) {
    return blocked(FINANCE_ERROR.INVALID_PRINCIPAL,
      `Principal must be a non-negative finite number. Received: ${principal}`, ts);
  }

  // Resolve rate: explicit > rateTier > legacy default
  let rate;
  let rateLabel = null;
  if (annualInterestRate != null) {
    rate = annualInterestRate;
  } else {
    const resolved = resolveIndicativeRate(principal, financeConfig);
    rate = resolved.rate;
    rateLabel = resolved.label;
  }

  if (typeof rate !== 'number' || !isFinite(rate) || rate < 0) {
    return blocked(FINANCE_ERROR.INVALID_INTEREST_RATE,
      `Annual interest rate must be a non-negative finite number. Received: ${rate}`, ts);
  }

  const maxRate = validation.maxAnnualInterestRate ?? 18;
  if (rate > maxRate) {
    return blocked(FINANCE_ERROR.INVALID_INTEREST_RATE,
      `Annual interest rate ${rate}% exceeds maximum ${maxRate}%.`, ts);
  }

  const minTenure = validation.minTenureYears ?? 1;
  const maxTenure = validation.maxTenureYears ?? 10;
  if (typeof tenure !== 'number' || !isFinite(tenure) || tenure < minTenure || tenure > maxTenure) {
    return blocked(FINANCE_ERROR.INVALID_TENURE,
      `Tenure must be between ${minTenure} and ${maxTenure} years. Received: ${tenure}`, ts);
  }

  // ---- Zero principal -------------------------------------------------------
  if (principal === 0) {
    return buildResult({
      principal: 0,
      annualInterestRate: rate,
      rateLabel,
      tenureYears: tenure,
      tenureMonths: tenure * 12,
      monthlyEMI: 0,
      totalRepayment: 0,
      totalInterest: 0,
      calculatedAt: ts,
      config: financeConfig,
      downPaymentPercentage,
      downPaymentAmount,
      grossQuotationAmount,
      postSubsidyInvestment,
    });
  }

  // ---- EMI calculation ------------------------------------------------------
  const tenureMonths = tenure * 12;

  let monthlyEMI;
  if (rate === 0) {
    // Zero-interest path: simple division
    monthlyEMI = Math.round(principal / tenureMonths);
  } else {
    // Standard PMT formula
    const monthlyRate = rate / 12 / 100;
    const compoundFactor = Math.pow(1 + monthlyRate, tenureMonths);
    const exactEMI = (principal * monthlyRate * compoundFactor) / (compoundFactor - 1);
    monthlyEMI = Math.round(exactEMI);
  }

  const totalRepayment = monthlyEMI * tenureMonths;
  const totalInterest = totalRepayment - principal;

  return buildResult({
    principal,
    annualInterestRate: rate,
    rateLabel,
    tenureYears: tenure,
    tenureMonths,
    monthlyEMI,
    totalRepayment,
    totalInterest,
    calculatedAt: ts,
    config: financeConfig,
    downPaymentPercentage,
    downPaymentAmount,
    grossQuotationAmount,
    postSubsidyInvestment,
  });
}

// ---- Result builders --------------------------------------------------------

function buildResult({
  principal, annualInterestRate, rateLabel, tenureYears, tenureMonths,
  monthlyEMI, totalRepayment, totalInterest, calculatedAt, config,
  downPaymentPercentage, downPaymentAmount, grossQuotationAmount, postSubsidyInvestment,
}) {
  return Object.freeze({
    source: FINANCE_SOURCE,
    status: FINANCE_STATUS_LIVE,
    available: true,
    engineVersion: FINANCE_ENGINE_VERSION,

    // §22 payload contract fields
    loanAmount: principal,
    interestRatePct: annualInterestRate,
    rateLabel: rateLabel ?? null,
    tenureYears,
    tenureMonths,
    monthlyEMI,
    // Rev2 additive (2026-09-05) — daily equivalence of the monthly EMI for
    // the "Daily Investment" mustache on the approved template. Pure
    // Math.round(monthlyEMI/30) — mirrors savingsEngine.dailySavings. The
    // renderer must never divide payload values; this field carries the
    // pre-rounded daily figure. Zero-principal path yields 0 (legitimate:
    // no loan → no daily payment). Blocked path emits null (see `blocked`).
    dailyPayment: Math.round(monthlyEMI / 30),
    totalInterest,
    totalRepayment,

    // Down payment passthrough (computed by workspace, not by engine)
    downPaymentPercentage: downPaymentPercentage ?? null,
    downPaymentAmount: downPaymentAmount ?? null,

    // Context passthrough
    grossQuotationAmount: grossQuotationAmount ?? null,
    postSubsidyInvestment: postSubsidyInvestment ?? null,

    // Metadata
    calculatedAt,
    configVersion: config.configVersion ?? null,

    // Assumptions
    assumptions: {
      formula: 'STANDARD_PMT_REDUCING_BALANCE',
      rounding: 'MATH_ROUND_MONTHLY_EMI',
      totalRepaymentBasis: 'ROUNDED_EMI_TIMES_MONTHS',
      totalInterestBasis: 'TOTAL_REPAYMENT_MINUS_PRINCIPAL',
      rateSource: 'INDICATIVE_CONFIG_TIER',
      rateQualification: config.source?.rateQualification ?? null,
      downPaymentNote: config.downPayment?.note ?? null,
    },
  });
}

function blocked(code, reason, calculatedAt) {
  return Object.freeze({
    source: FINANCE_SOURCE,
    status: code,
    available: false,
    reason,
    engineVersion: FINANCE_ENGINE_VERSION,
    loanAmount: 0,
    interestRatePct: 0,
    rateLabel: null,
    tenureYears: 0,
    tenureMonths: 0,
    monthlyEMI: 0,
    // Rev2 additive (2026-09-05) — null on the blocked path to signal
    // "no daily payment computed" (distinct from a legitimate zero).
    dailyPayment: null,
    totalInterest: 0,
    totalRepayment: 0,
    downPaymentPercentage: null,
    downPaymentAmount: null,
    grossQuotationAmount: null,
    postSubsidyInvestment: null,
    calculatedAt: calculatedAt ?? null,
  });
}

// ---- Configuration validation -----------------------------------------------

/**
 * Validate finance config structure.
 *
 * @param {object} config — parsed finance-config.json
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateFinanceConfig(config) {
  const errors = [];
  if (!config || typeof config !== 'object') {
    return { valid: false, errors: ['Config must be a non-null object'] };
  }

  if (!config.defaults || typeof config.defaults !== 'object') {
    errors.push('Missing defaults section');
  } else {
    if (config.defaults.tenureYears == null || config.defaults.tenureYears <= 0) {
      errors.push('defaults.tenureYears must be a positive number');
    }
  }

  if (!config.validation || typeof config.validation !== 'object') {
    errors.push('Missing validation section');
  } else {
    if (config.validation.maxAnnualInterestRate == null || config.validation.maxAnnualInterestRate <= 0) {
      errors.push('validation.maxAnnualInterestRate must be a positive number');
    }
    if (config.validation.minTenureYears == null || config.validation.minTenureYears <= 0) {
      errors.push('validation.minTenureYears must be a positive number');
    }
    if (config.validation.maxTenureYears == null || config.validation.maxTenureYears <= 0) {
      errors.push('validation.maxTenureYears must be a positive number');
    }
  }

  if (!Array.isArray(config.rateTiers) || config.rateTiers.length === 0) {
    errors.push('rateTiers must be a non-empty array');
  } else {
    for (const [i, tier] of config.rateTiers.entries()) {
      if (tier.annualInterestRate == null || tier.annualInterestRate < 0) {
        errors.push(`rateTiers[${i}].annualInterestRate must be a non-negative number`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
