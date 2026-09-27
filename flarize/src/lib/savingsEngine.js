/**
 * SAVINGS ENGINE  (Phase 3, V2 — KSEB Bill-Difference Model)
 *
 * Pure calculation module — first-year solar savings using KSEB bill-difference.
 *
 * No React, no DOM, no fetch, no pricing, no subsidy, no GST, no margin,
 * no EMI, no procurement, no BOM, no catalog. Zero dependencies beyond
 * JavaScript builtins + the Energy Engine's unitsToBill.
 *
 * Self-consumption model: FULL_OFFSET
 *   offset = min(monthlyGeneration, monthlyConsumption)
 *   postSolarConsumption = max(monthlyConsumption - monthlyGeneration, 0)
 *
 * Savings formula (V2 — bill-difference):
 *   currentBill   = unitsToBill(monthlyConsumption × 2, regionConfig, phase)
 *   postSolarBill = unitsToBill(postSolarConsumption × 2, regionConfig, phase)
 *   monthlySavings = (currentBill.total - postSolarBill.total) / 2
 *
 * This replaces V1's simplistic: generation × averageTariffRate
 *
 * Lifetime projections (degradation, tariff escalation, 25-year graph)
 * are NOT implemented — those decisions are pending approval.
 *
 * @module savingsEngine
 */

import { unitsToBill } from './energyEngine.js';

// ---- Version + constants ----------------------------------------------------

export const SAVINGS_ENGINE_VERSION = '2.0.0';
export const SAVINGS_SOURCE = 'SAVINGS_ENGINE';
export const SAVINGS_STATUS_LIVE = 'LIVE';

export const SAVINGS_ERROR = Object.freeze({
  MISSING_ENERGY_RESULT: 'MISSING_ENERGY_RESULT',
  MISSING_TARIFF: 'MISSING_TARIFF',
  MISSING_INVESTMENT: 'MISSING_INVESTMENT',
  ZERO_GENERATION: 'ZERO_GENERATION',
  ZERO_CONSUMPTION: 'ZERO_CONSUMPTION',
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_REGION_CONFIG: 'MISSING_REGION_CONFIG',
});

export const SELF_CONSUMPTION_MODEL = Object.freeze({
  FULL_OFFSET: 'FULL_OFFSET',
});

// ---- Core calculation -------------------------------------------------------

/**
 * Calculate first-year solar savings via KSEB bill-difference model.
 *
 * @param {object} params
 * @param {object} params.energyProfileResult — result from calculateEnergyProfile()
 * @param {number|null} [params.customerTotalIncludingGST] — gross investment for payback
 * @param {number|null} [params.currentBillAmount] — customer's current monthly bill
 * @param {string} [params.currentBillCycle] — 'monthly' or 'bimonthly'
 * @param {object} [params.regionConfig] — region tariff config (from energy-config.json regions[x])
 * @param {object} [params.config] — savings config (data/savings-config.json)
 * @returns {object} savings result matching savingsResult contract
 */
export function calculateSavings({
  energyProfileResult = null,
  customerTotalIncludingGST = null,
  currentBillAmount = null,
  currentBillCycle = 'monthly',
  regionConfig = null,
  config = {},
} = {}) {
  // ---- Validate energy input ----
  if (!energyProfileResult || !energyProfileResult.available) {
    return blocked(SAVINGS_ERROR.MISSING_ENERGY_RESULT,
      'No Energy Engine result available.');
  }

  const {
    monthlyConsumption,
    monthlyGeneration,
    annualGeneration,
    averageTariffRate,
    recommendedSystemSizeKw,
    dailyGenerationLow,
    dailyGenerationHigh,
    phase: energyPhase,
  } = energyProfileResult;

  // ---- Validate required fields ----
  if (averageTariffRate == null || averageTariffRate <= 0) {
    return blocked(SAVINGS_ERROR.MISSING_TARIFF,
      'No valid average tariff rate from Energy Engine.');
  }

  if (monthlyGeneration == null || monthlyGeneration <= 0) {
    return blocked(SAVINGS_ERROR.ZERO_GENERATION,
      'No generation estimate from Energy Engine.');
  }

  if (monthlyConsumption == null || monthlyConsumption <= 0) {
    return blocked(SAVINGS_ERROR.ZERO_CONSUMPTION,
      'No consumption estimate from Energy Engine.');
  }

  // ---- Determine calculation mode ----
  // V2 (bill-difference) requires regionConfig; fallback to V1 (averageTariffRate) if absent
  const useBillDifference = regionConfig != null;
  const phase = energyPhase || 'single';

  // ---- Self-consumption model: FULL_OFFSET ----
  const effectiveMonthlyGen = Math.min(monthlyGeneration, monthlyConsumption);
  const postSolarMonthlyConsumption = Math.max(monthlyConsumption - monthlyGeneration, 0);

  // ---- Generation range ----
  const monthlyGenLow = Math.round(dailyGenerationLow * 30);
  const monthlyGenHigh = Math.round(dailyGenerationHigh * 30);
  const postSolarConsumptionHigh = Math.max(monthlyConsumption - monthlyGenLow, 0);  // low gen → high residual
  const postSolarConsumptionLow = Math.max(monthlyConsumption - monthlyGenHigh, 0);  // high gen → low residual

  let monthlySavings, monthlySavingsLow, monthlySavingsHigh;
  let currentMonthlyBill, postSolarBillLow, postSolarBillHigh;
  let currentBillBreakdown = null, postSolarBillBreakdown = null;
  let savingsBasis;

  if (useBillDifference) {
    // ---- V2: KSEB bill-difference ----
    // Current bill via KSEB billing engine
    const currentBiMonthly = unitsToBill(monthlyConsumption * 2, regionConfig, phase);
    currentMonthlyBill = Math.round(currentBiMonthly.total / 2);
    currentBillBreakdown = currentBiMonthly;

    // Post-solar bill (nominal generation)
    const postSolarBiMonthly = unitsToBill(postSolarMonthlyConsumption * 2, regionConfig, phase);
    monthlySavings = Math.max(0, Math.round(currentBiMonthly.total / 2) - Math.round(postSolarBiMonthly.total / 2));
    postSolarBillBreakdown = postSolarBiMonthly;

    // Post-solar bill LOW (high generation → low residual consumption → low bill)
    const postSolarBiMonthlyLow = unitsToBill(postSolarConsumptionLow * 2, regionConfig, phase);
    postSolarBillLow = Math.round(postSolarBiMonthlyLow.total / 2);

    // Post-solar bill HIGH (low generation → high residual consumption → high bill)
    const postSolarBiMonthlyHigh = unitsToBill(postSolarConsumptionHigh * 2, regionConfig, phase);
    postSolarBillHigh = Math.round(postSolarBiMonthlyHigh.total / 2);

    // Savings range
    monthlySavingsHigh = Math.max(0, currentMonthlyBill - postSolarBillLow);
    monthlySavingsLow = Math.max(0, currentMonthlyBill - postSolarBillHigh);

    savingsBasis = 'BILL_DIFFERENCE — savings = KSEB_bill(consumption) − KSEB_bill(consumption − generation)';
  } else {
    // ---- V1 fallback: generation × averageTariffRate ----
    monthlySavings = Math.round(effectiveMonthlyGen * averageTariffRate);

    const effectiveMonthlyGenLow = Math.min(monthlyGenLow, monthlyConsumption);
    const effectiveMonthlyGenHigh = Math.min(monthlyGenHigh, monthlyConsumption);
    monthlySavingsLow = Math.round(effectiveMonthlyGenLow * averageTariffRate);
    monthlySavingsHigh = Math.round(effectiveMonthlyGenHigh * averageTariffRate);

    // Normalize current bill
    const normalizedCycle = normalizeCycle(currentBillCycle);
    if (currentBillAmount != null && currentBillAmount > 0) {
      currentMonthlyBill = normalizedCycle === 'bimonthly'
        ? Math.round(currentBillAmount / 2)
        : currentBillAmount;
    } else {
      currentMonthlyBill = Math.round(monthlyConsumption * averageTariffRate);
    }

    postSolarBillHigh = Math.max(0, currentMonthlyBill - monthlySavingsLow);
    postSolarBillLow = Math.max(0, currentMonthlyBill - monthlySavingsHigh);

    savingsBasis = 'FIRST_YEAR — generation × averageTariffRate (V1 fallback, no regionConfig)';
  }

  // ---- Annual savings ----
  const annualSavingsAmount = monthlySavings * 12;

  // ---- Payback / return period ----
  let returnPeriodMonths = null;
  if (customerTotalIncludingGST != null && customerTotalIncludingGST > 0 && annualSavingsAmount > 0) {
    returnPeriodMonths = Math.ceil((customerTotalIncludingGST / annualSavingsAmount) * 12);
  }

  // ---- Lifetime projection (config-gated) ----
  // 2026-09-09 — the 25-year graph, lifetime KSEB spend and lifetime net
  // savings are computed ONLY when the business has approved the two
  // assumptions in data/savings-config.json: tariffEscalationLow/High (% per
  // year) and degradationRatePerYear (% per year). While either is null the
  // fields stay null and the renderer hides the projection — nothing is
  // assumed on the owner's behalf.
  const projection = projectLifetime({
    config, currentMonthlyBill, postSolarBillLow, postSolarBillHigh, monthlySavings,
    customerTotalIncludingGST,
  });

  // ---- Generation reference fields ----
  const systemSizeKw = recommendedSystemSizeKw ?? null;
  const dailyGenerationUnits = systemSizeKw != null && dailyGenerationLow != null && dailyGenerationHigh != null
    ? Math.round(((dailyGenerationLow + dailyGenerationHigh) / 2) * 10) / 10
    : null;
  const annualOutputKwh = annualGeneration ?? null;

  // ---- Build result matching savingsResult contract ----
  return {
    source: SAVINGS_SOURCE,
    status: SAVINGS_STATUS_LIVE,
    available: true,
    engineVersion: SAVINGS_ENGINE_VERSION,

    // System reference
    systemSizeKw,

    // Generation
    dailyGenerationUnits,
    annualOutputKwh,

    // Savings (range)
    monthlySavingsLow,
    monthlySavingsHigh,

    // Savings (midpoint) — the same value used above to derive
    // `annualSavingsAmount = monthlySavings * 12`. Emitted so downstream
    // callers do not have to reconstruct it from the range, and so the
    // renderer never performs arithmetic on payload values.
    monthlySavings,

    // Daily equivalence for the "daily investment" mustache on the approved
    // template. Pure /30 of the monthly midpoint, computed here in the engine
    // — the renderer must never divide payload values.
    dailySavings: Math.round(monthlySavings / 30),

    annualSavingsAmount,

    // Lifetime — null until savings-config carries the approved escalation +
    // degradation assumptions (see projectLifetime).
    lifetimeSavingsAmount: projection.lifetimeSavingsAmount,

    // Return period
    returnPeriodMonths,

    // Post-solar bill (range)
    postSolarBillLow,
    postSolarBillHigh,

    // Current bill (computed via KSEB billing engine when available)
    currentMonthlyBill,

    // Bill breakdowns (V2 only — null when V1 fallback)
    currentBillBreakdown: useBillDifference ? {
      energyCharge: Math.round(currentBillBreakdown.energyCharge / 2),
      fixedCharge: Math.round(currentBillBreakdown.fixedCharge / 2),
      duty: Math.round(currentBillBreakdown.duty / 2),
      meterRent: Math.round(currentBillBreakdown.meterRent / 2),
      billingCategory: currentBillBreakdown.billingCategory,
    } : null,
    postSolarBillBreakdown: useBillDifference ? {
      energyCharge: Math.round(postSolarBillBreakdown.energyCharge / 2),
      fixedCharge: Math.round(postSolarBillBreakdown.fixedCharge / 2),
      duty: Math.round(postSolarBillBreakdown.duty / 2),
      meterRent: Math.round(postSolarBillBreakdown.meterRent / 2),
      billingCategory: postSolarBillBreakdown.billingCategory,
    } : null,

    // Tariff escalation — copied from the approved config (null = not approved)
    tariffEscalationLow: projection.tariffEscalationLow,
    tariffEscalationHigh: projection.tariffEscalationHigh,

    // Lifetime projections (null until approved assumptions exist)
    lifetimeKSEBSpend: projection.lifetimeKSEBSpend,
    lifetimeYears: projection.lifetimeYears,

    // Graph — cumulative KSEB cost vs (system cost + residual bills), per year
    graphPoints: projection.graphPoints,

    // Model metadata
    selfConsumptionModel: SELF_CONSUMPTION_MODEL.FULL_OFFSET,
    assumptions: {
      selfConsumption: 'FULL_OFFSET — generation offsets grid purchase, capped at consumption',
      degradation: projection.available
        ? `APPROVED_CONFIG — ${projection.degradationRatePerYear}% per year applied to the offset`
        : 'NOT_APPROVED — no degradation applied',
      tariffEscalation: projection.available
        ? `APPROVED_CONFIG — ${projection.tariffEscalationLow}%–${projection.tariffEscalationHigh}% per year (graph uses the midpoint)`
        : 'NOT_APPROVED — no escalation applied',
      exportCompensation: 'NOT_APPROVED — surplus generation not valued',
      savingsBasis,
      paybackBasis: customerTotalIncludingGST != null
        ? 'GROSS — uses customerTotalIncludingGST, subsidy not deducted'
        : 'UNAVAILABLE — no investment amount provided',
    },
  };
}

// ---- Lifetime projection ----------------------------------------------------

function finitePct(v) { return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 100 ? v : null; }

/**
 * 25-year (config.lifetimeYears) projection. Pure arithmetic over the
 * first-year figures already derived above and the approved assumptions:
 *   KSEB bill in year y      = currentMonthlyBill × 12 × (1 + esc)^(y-1)
 *   residual bill in year y  = postSolarBill(mid) × 12 × (1 + esc)^(y-1)
 *                              + savings lost to degradation (deg × (y-1))
 *   cumulative "with solar"  = system cost + Σ residual bills
 * Returns nulls when any assumption is missing.
 */
export function projectLifetime({ config = {}, currentMonthlyBill, postSolarBillLow, postSolarBillHigh, monthlySavings, customerTotalIncludingGST }) {
  const none = Object.freeze({ available: false, lifetimeSavingsAmount: null, lifetimeKSEBSpend: null, graphPoints: null, tariffEscalationLow: null, tariffEscalationHigh: null, lifetimeYears: null, degradationRatePerYear: null });
  const escLow = finitePct(config?.tariffEscalationLow);
  const escHigh = finitePct(config?.tariffEscalationHigh);
  const deg = finitePct(config?.degradationRatePerYear);
  const years = Number.isInteger(config?.lifetimeYears) && config.lifetimeYears > 0 ? config.lifetimeYears : null;
  if (escLow == null || escHigh == null || deg == null || years == null) return none;
  if (!(currentMonthlyBill > 0) || postSolarBillLow == null || postSolarBillHigh == null || !(monthlySavings >= 0)) return none;
  const esc = (escLow + escHigh) / 2 / 100;
  const degr = deg / 100;
  const postMid = (postSolarBillLow + postSolarBillHigh) / 2;
  const investment = customerTotalIncludingGST != null && customerTotalIncludingGST > 0 ? customerTotalIncludingGST : 0;
  let cumKseb = 0;
  let cumSolar = investment;
  const graphPoints = [];
  for (let y = 1; y <= years; y += 1) {
    const growth = Math.pow(1 + esc, y - 1);
    const ksebYear = currentMonthlyBill * 12 * growth;
    // Degradation shrinks the offset: the lost savings are paid to KSEB again.
    const lostSavings = monthlySavings * 12 * growth * Math.min(1, degr * (y - 1));
    const residualYear = postMid * 12 * growth + lostSavings;
    cumKseb += ksebYear;
    cumSolar += residualYear;
    graphPoints.push({ year: y, withoutSolarCumulative: Math.round(cumKseb), withSolarCumulative: Math.round(cumSolar) });
  }
  return Object.freeze({
    available: true,
    lifetimeYears: years,
    degradationRatePerYear: deg,
    tariffEscalationLow: escLow,
    tariffEscalationHigh: escHigh,
    lifetimeKSEBSpend: Math.round(cumKseb),
    lifetimeSavingsAmount: Math.max(0, Math.round(cumKseb - cumSolar)),
    graphPoints: Object.freeze(graphPoints),
  });
}

// ---- Blocked result ---------------------------------------------------------

function blocked(code, reason) {
  return {
    source: SAVINGS_SOURCE,
    status: code,
    available: false,
    reason,
    engineVersion: SAVINGS_ENGINE_VERSION,
  };
}

// ---- Utility ----------------------------------------------------------------

function normalizeCycle(cycle) {
  if (!cycle) return 'monthly';
  const raw = cycle.toString().toLowerCase().replace(/[\s\-_]/g, '');
  return raw.includes('bimonthly') ? 'bimonthly' : 'monthly';
}

// ---- Configuration validation -----------------------------------------------

/**
 * Validate savings config structure.
 *
 * @param {object} config — parsed savings-config.json
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateSavingsConfig(config) {
  const errors = [];
  if (!config || typeof config !== 'object') {
    return { valid: false, errors: ['Config must be a non-null object'] };
  }

  if (!config.selfConsumptionModel) {
    errors.push('Missing selfConsumptionModel');
  } else if (config.selfConsumptionModel !== 'FULL_OFFSET') {
    errors.push(`Unsupported selfConsumptionModel: ${config.selfConsumptionModel}`);
  }

  if (config.lifetimeYears != null && (typeof config.lifetimeYears !== 'number' || config.lifetimeYears <= 0)) {
    errors.push('lifetimeYears must be a positive number or null');
  }

  return { valid: errors.length === 0, errors };
}
