/**
 * ENERGY ENGINE — Pure calculation module.
 *
 * Extracted from App.jsx KSEB bill calculator (lines 1443-1590).
 * Configurable tariff + yield. No React. No DOM. No pricing. No subsidy.
 * No GST. No margin. No EMI. No procurement. No finance.
 *
 * Architecture:
 *   energyEngine(inputs, config) → energyProfileResult
 *
 * The config is supplied externally (data/energy-config.json or frozen
 * snapshot). The engine never reads the config file itself — callers load
 * and pass it.
 *
 * BILLING MODEL (v2):
 *   KSEB LT-1A domestic. Bi-monthly billing.
 *   Telescopic: progressive slabs (≤500 bi-monthly units).
 *   Non-telescopic: entire consumption at single flat rate based on
 *     consumption band (>500 bi-monthly units). Multi-slab, not single rate.
 *   Fixed charge: consumption-dependent AND phase-dependent.
 *   Meter rent: phase-dependent.
 *   Electricity duty: 10% of energy charge only (not on fixed/meter).
 *
 * FINANCIAL BOUNDARY:
 *   This module does NOT calculate quotation price, GST, margin,
 *   EMI, loan, finance or procurement cost. It does NOT access the catalog,
 *   BOM or commercial snapshot for pricing purposes. It may RECEIVE an
 *   approved commercial amount as an input for downstream payback calculation
 *   by a separate Savings Engine — it never derives that amount.
 *
 * SNAPSHOT / IMMUTABILITY:
 *   The caller freezes the result at issuance. This module returns plain
 *   objects; the workspace layer freezes them when storing an issued document.
 */

// -------------------------------------------------------------------------
// Engine version — bumped when calculation logic changes
// -------------------------------------------------------------------------
export const ENERGY_ENGINE_VERSION = 'energyEngine.2';

// -------------------------------------------------------------------------
// Source tag for results
// -------------------------------------------------------------------------
export const ENERGY_SOURCE = 'ENERGY_ENGINE';
export const ENERGY_STATUS_LIVE = 'LIVE';

// -------------------------------------------------------------------------
// Error codes
// -------------------------------------------------------------------------
export const ENERGY_ERROR = Object.freeze({
  NO_REGION_CONFIG: 'NO_REGION_CONFIG',
  INVALID_BILL_AMOUNT: 'INVALID_BILL_AMOUNT',
  NO_YIELD_CONFIG: 'NO_YIELD_CONFIG',
  NO_TARIFF_CONFIG: 'NO_TARIFF_CONFIG',
});

// -------------------------------------------------------------------------
// Internal: look up fixed charge from consumption-dependent slabs
// -------------------------------------------------------------------------

/**
 * Look up bi-monthly fixed charge based on consumption and phase.
 *
 * Supports two config shapes:
 *   NEW: regionConfig.fixedChargeSlabs.singlePhase / .threePhase (array)
 *   OLD: regionConfig.fixedChargeBiMonthly (flat number — backward compat)
 *
 * @param {number} biMonthlyUnits — consumption
 * @param {object} regionConfig — region config
 * @param {string} phase — 'single' | 'three'
 * @returns {number} bi-monthly fixed charge (₹)
 */
function lookupFixedCharge(biMonthlyUnits, regionConfig, phase) {
  const slabTable = regionConfig.fixedChargeSlabs;
  if (slabTable) {
    const slabs = phase === 'three' ? slabTable.threePhase : slabTable.singlePhase;
    if (Array.isArray(slabs) && slabs.length > 0) {
      for (const slab of slabs) {
        if (slab.upToUnits == null || biMonthlyUnits <= slab.upToUnits) {
          return slab.chargeBiMonthly;
        }
      }
      // Past last slab — use last slab's value
      return slabs[slabs.length - 1].chargeBiMonthly;
    }
  }
  // Backward compat: flat fixed charge
  return regionConfig.fixedChargeBiMonthly ?? 80;
}

// -------------------------------------------------------------------------
// Internal: look up meter rent from phase-dependent config
// -------------------------------------------------------------------------

/**
 * Look up bi-monthly meter rent based on phase.
 *
 * Supports two config shapes:
 *   NEW: regionConfig.meterRent.singlePhaseBiMonthly / .threePhaseBiMonthly
 *   OLD: regionConfig.meterRentBiMonthly (flat number — backward compat)
 *
 * @param {object} regionConfig
 * @param {string} phase — 'single' | 'three'
 * @returns {number} bi-monthly meter rent (₹)
 */
function lookupMeterRent(regionConfig, phase) {
  const meterRentConfig = regionConfig.meterRent;
  if (meterRentConfig && typeof meterRentConfig === 'object') {
    return phase === 'three'
      ? (meterRentConfig.threePhaseBiMonthly ?? 30)
      : (meterRentConfig.singlePhaseBiMonthly ?? 12);
  }
  // Backward compat: flat meter rent
  return regionConfig.meterRentBiMonthly ?? 14;
}

// -------------------------------------------------------------------------
// Internal: look up non-telescopic energy rate from multi-slab config
// -------------------------------------------------------------------------

/**
 * Look up the flat energy rate for non-telescopic billing.
 *
 * Supports two config shapes:
 *   NEW: regionConfig.nonTelescopicSlabs (array of { upToUnits, ratePerUnit })
 *   OLD: regionConfig.nonTelescopicRate (flat number — backward compat)
 *
 * In non-telescopic billing, the ENTIRE consumption is charged at the single
 * rate determined by which band the total consumption falls into.
 *
 * @param {number} biMonthlyUnits — total consumption
 * @param {object} regionConfig
 * @returns {number} rate per unit (₹/kWh)
 */
function lookupNonTelescopicRate(biMonthlyUnits, regionConfig) {
  const slabs = regionConfig.nonTelescopicSlabs;
  if (Array.isArray(slabs) && slabs.length > 0) {
    for (const slab of slabs) {
      if (slab.upToUnits == null || biMonthlyUnits <= slab.upToUnits) {
        return slab.ratePerUnit;
      }
    }
    // Past last slab — use last slab's rate
    return slabs[slabs.length - 1].ratePerUnit;
  }
  // Backward compat: single flat rate
  return regionConfig.nonTelescopicRate ?? 8.20;
}

// -------------------------------------------------------------------------
// Tariff calculation — forward: bi-monthly units → bill
// -------------------------------------------------------------------------

/**
 * Calculate bi-monthly electricity bill from units consumed.
 * KSEB LT-1A logic with telescopic / non-telescopic distinction.
 *
 * @param {number} biMonthlyUnits — units consumed in a bi-monthly period
 * @param {object} regionConfig — region config from energy-config.json
 * @param {string} [phase='single'] — 'single' | 'three'
 * @returns {object} breakdown: { energyCharge, fixedCharge, duty, meterRent, total, biMonthlyUnits, monthlyUnits, billingCategory, phase }
 */
export function unitsToBill(biMonthlyUnits, regionConfig, phase = 'single') {
  const slabs = regionConfig.tariffSlabs;
  const nonTelescopicThreshold = regionConfig.nonTelescopicThreshold ?? 500;
  const dutyPct = regionConfig.electricityDutyPct ?? 10;

  let energyCharge = 0;
  let billingCategory = 'telescopic';

  if (biMonthlyUnits <= nonTelescopicThreshold) {
    // Telescopic: progressive slab rates
    let remaining = biMonthlyUnits;
    let prev = 0;
    for (const slab of slabs) {
      const slabWidth = slab.upToUnits - prev;
      const slabUnits = Math.min(remaining, slabWidth);
      if (slabUnits <= 0) break;
      energyCharge += slabUnits * slab.ratePerUnit;
      remaining -= slabUnits;
      prev = slab.upToUnits;
    }
  } else {
    // Non-telescopic: entire consumption at single flat rate based on band
    billingCategory = 'nonTelescopic';
    const rate = lookupNonTelescopicRate(biMonthlyUnits, regionConfig);
    energyCharge = biMonthlyUnits * rate;
  }

  const fixedCharge = lookupFixedCharge(biMonthlyUnits, regionConfig, phase);
  const meterRent = lookupMeterRent(regionConfig, phase);

  // Electricity duty: 10% of energy charge ONLY (not on fixed charge or meter rent)
  const duty = Math.round(energyCharge * (dutyPct / 100));
  energyCharge = Math.round(energyCharge);
  const total = energyCharge + fixedCharge + duty + meterRent;

  return {
    energyCharge,
    fixedCharge,
    duty,
    meterRent,
    total,
    biMonthlyUnits,
    monthlyUnits: Math.round(biMonthlyUnits / 2),
    billingCategory,
    phase,
  };
}

// -------------------------------------------------------------------------
// Tariff calculation — reverse: bill amount → units (binary search)
// -------------------------------------------------------------------------

/**
 * Reverse-engineer bi-monthly units from a bill amount using binary search.
 *
 * The bill function is monotonically increasing (higher consumption →
 * higher bill) despite discontinuities at slab boundaries. Binary search
 * converges to the correct consumption level.
 *
 * @param {number} biMonthlyBillAmount — target bill amount (₹)
 * @param {object} regionConfig — region config
 * @param {string} [phase='single'] — 'single' | 'three'
 * @returns {number} estimated bi-monthly units
 */
export function billToUnits(biMonthlyBillAmount, regionConfig, phase = 'single') {
  let lo = 0;
  let hi = 3000;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    const bill = unitsToBill(mid, regionConfig, phase);
    if (bill.total < biMonthlyBillAmount) lo = mid;
    else hi = mid;
  }
  return Math.round((lo + hi) / 2);
}

// -------------------------------------------------------------------------
// Core energy calculation
// -------------------------------------------------------------------------

/**
 * Calculate energy profile from a customer's electricity bill.
 *
 * This is the primary entry point. It:
 *   1. Converts bill amount → monthly/annual consumption (units)
 *   2. Calculates recommended system size from consumption + yield
 *   3. Estimates daily/monthly generation for that system size
 *   4. Calculates average tariff rate (effective bill rate, NOT energy tariff)
 *   5. Estimates surplus export
 *
 * It does NOT:
 *   - Calculate quotation price, GST, margin, EMI, finance
 *   - Access procurement cost or BOM
 *   - Calculate savings or payback (Savings Engine responsibility)
 *
 * @param {object} inputs
 * @param {number} inputs.billAmount — customer's bill amount (₹)
 * @param {string} inputs.billingCycle — 'monthly' | 'bimonthly'
 * @param {string} [inputs.phase='single'] — 'single' | 'three'
 * @param {number} inputs.systemSizeKw — explicit system size (overrides auto-sizing if provided)
 * @param {object} config — energy configuration object (from data/energy-config.json)
 * @param {string} [regionId] — region key (defaults to config.defaultRegion)
 * @returns {object} energyProfileResult compatible with quotationPayload.js contract
 */
export function calculateEnergyProfile(inputs, config, regionId) {
  const resolvedRegion = regionId || config.defaultRegion;
  const regionConfig = config.regions?.[resolvedRegion];

  // ---- Guard: unsupported region → BLOCKED ----
  if (!regionConfig) {
    return {
      available: false,
      source: ENERGY_SOURCE,
      status: 'BLOCKED',
      error: ENERGY_ERROR.NO_REGION_CONFIG,
      reason: `No energy configuration for region "${resolvedRegion}". Cannot silently use another region's tariff or yield.`,
      regionId: resolvedRegion,
      engineVersion: ENERGY_ENGINE_VERSION,
    };
  }

  // ---- Guard: yield config ----
  if (!regionConfig.yield || typeof regionConfig.yield.dailyGenPerKw !== 'number') {
    return {
      available: false,
      source: ENERGY_SOURCE,
      status: 'BLOCKED',
      error: ENERGY_ERROR.NO_YIELD_CONFIG,
      reason: `No yield configuration for region "${resolvedRegion}".`,
      regionId: resolvedRegion,
      engineVersion: ENERGY_ENGINE_VERSION,
    };
  }

  // ---- Guard: tariff config ----
  if (!regionConfig.tariffSlabs || !Array.isArray(regionConfig.tariffSlabs) || regionConfig.tariffSlabs.length === 0) {
    return {
      available: false,
      source: ENERGY_SOURCE,
      status: 'BLOCKED',
      error: ENERGY_ERROR.NO_TARIFF_CONFIG,
      reason: `No tariff configuration for region "${resolvedRegion}".`,
      regionId: resolvedRegion,
      engineVersion: ENERGY_ENGINE_VERSION,
    };
  }

  const { billAmount, billingCycle = 'monthly', systemSizeKw, phase = 'single' } = inputs;

  // Normalize phase
  const resolvedPhase = (phase || '').toString().toLowerCase().includes('three') ? 'three' : 'single';

  // ---- Guard: bill amount ----
  const amt = parseFloat(billAmount) || 0;
  if (amt <= 0) {
    return {
      available: false,
      source: ENERGY_SOURCE,
      status: 'BLOCKED',
      error: ENERGY_ERROR.INVALID_BILL_AMOUNT,
      reason: 'Bill amount must be a positive number.',
      regionId: resolvedRegion,
      engineVersion: ENERGY_ENGINE_VERSION,
    };
  }

  // ---- Convert to standard billing period ----
  const monthlyBill = billingCycle === 'bimonthly' ? amt / 2 : amt;
  const biMonthlyBill = monthlyBill * 2;

  // ---- Reverse calculation: bill → units ----
  const estimatedBiMonthlyUnits = billToUnits(biMonthlyBill, regionConfig, resolvedPhase);
  const breakdown = unitsToBill(estimatedBiMonthlyUnits, regionConfig, resolvedPhase);
  const monthlyUnits = Math.round(estimatedBiMonthlyUnits / 2);
  const annualUnits = monthlyUnits * 12;

  // ---- Yield and generation ----
  const dailyGenPerKw = regionConfig.yield.dailyGenPerKw;
  const monthlyGenPerKw = Math.round(dailyGenPerKw * 30);

  // ---- System sizing ----
  const exactKw = monthlyUnits / monthlyGenPerKw;
  const coverageTarget = regionConfig.sizing?.coverageTarget ?? 0.85;

  // Use explicit system size if provided, otherwise auto-size
  let recommendedKw;
  if (typeof systemSizeKw === 'number' && systemSizeKw > 0) {
    recommendedKw = systemSizeKw;
  } else {
    // Round up to nearest integer kW that covers ≥ coverageTarget of consumption
    const targetKw = exactKw * coverageTarget;
    recommendedKw = Math.ceil(targetKw);
    if (recommendedKw < 1) recommendedKw = 1;
  }

  // ---- Generation estimate for recommended size ----
  const dailyGeneration = recommendedKw * dailyGenPerKw;
  const monthlyGeneration = recommendedKw * monthlyGenPerKw;
  const annualGeneration = monthlyGeneration * 12;

  // ---- Generation range (±10% for conservative/optimistic) ----
  const dailyGenerationLow = Math.round(dailyGeneration * 0.9 * 10) / 10;
  const dailyGenerationHigh = Math.round(dailyGeneration * 1.1 * 10) / 10;

  // ---- Average tariff rate ----
  // NOTE: This is the EFFECTIVE CUSTOMER BILL RATE (total bill / units),
  // NOT the KSEB energy tariff. It includes fixed charge, duty, and meter
  // rent spread across all units. The Savings Engine uses this field — do
  // not change its semantics without updating downstream consumers.
  const avgRate = monthlyUnits > 0
    ? Math.round(((breakdown.total / 2) / monthlyUnits) * 100) / 100
    : 0;

  // ---- Monthly KSEB value (what the generation is worth at current tariff) ----
  const monthlyKsebValueLow = Math.round(dailyGenerationLow * 30 * avgRate);
  const monthlyKsebValueHigh = Math.round(dailyGenerationHigh * 30 * avgRate);

  // ---- Surplus export (generation - consumption, capped at 0) ----
  const homeUsesUnitsPerDay = monthlyUnits > 0 ? Math.round((monthlyUnits / 30) * 10) / 10 : 0;
  const surplusExportedLow = Math.max(0, Math.round((dailyGenerationLow - homeUsesUnitsPerDay) * 10) / 10);
  const surplusExportedHigh = Math.max(0, Math.round((dailyGenerationHigh - homeUsesUnitsPerDay) * 10) / 10);

  // ---- Build result matching energyProfileResult contract ----
  return {
    available: true,
    source: ENERGY_SOURCE,
    status: ENERGY_STATUS_LIVE,
    engineVersion: ENERGY_ENGINE_VERSION,

    // Region and configuration metadata
    regionId: resolvedRegion,
    regionName: regionConfig.regionName,
    discom: regionConfig.discom,
    tariffName: regionConfig.tariffName,
    tariffVersion: regionConfig.tariffVersion,
    configVersion: config.configVersion,

    // Yield assumption (explicit, not buried)
    yieldAssumption: {
      dailyGenPerKw,
      unit: regionConfig.yield.unit,
      source: regionConfig.yield.source,
    },

    // Sizing assumption (explicit, not buried)
    sizingAssumption: {
      coverageTarget,
      note: regionConfig.sizing?.note ?? `System sized to cover ≥${Math.round(coverageTarget * 100)}% of consumption`,
    },

    // Consumption
    monthlyConsumption: monthlyUnits,
    monthlyConsumptionUnit: 'kWh',
    annualConsumption: annualUnits,
    annualConsumptionUnit: 'kWh',
    biMonthlyUnits: estimatedBiMonthlyUnits,

    // Bill breakdown
    billBreakdown: breakdown,
    averageTariffRate: avgRate,
    averageTariffRateUnit: '₹/kWh',
    averageTariffRateNote: 'Effective customer bill rate (total bill / units). Includes fixed charge, duty, meter rent. NOT the KSEB energy-only tariff.',

    // Connection phase
    phase: resolvedPhase,

    // System sizing
    exactSystemSizeKw: Math.round(exactKw * 10) / 10,
    recommendedSystemSizeKw: recommendedKw,

    // Generation
    dailyGenerationLow,
    dailyGenerationHigh,
    dailyGenerationUnit: 'kWh',
    monthlyGeneration,
    monthlyGenerationUnit: 'kWh',
    annualGeneration,
    annualGenerationUnit: 'kWh',

    // KSEB value of generation
    monthlyKsebValueLow,
    monthlyKsebValueHigh,
    monthlyKsebValueUnit: '₹',

    // Home usage and surplus
    homeUsesUnitsPerDay,
    homeUsesUnitsPerDayUnit: 'kWh',
    surplusExportedLow,
    surplusExportedHigh,
    surplusExportedUnit: 'kWh/day',
  };
}

// -------------------------------------------------------------------------
// Configuration loader helper
// -------------------------------------------------------------------------

/**
 * Load energy config from a JSON object. This is the ONLY way config enters
 * the engine. The engine never reads files.
 *
 * @param {object} configObj — parsed energy-config.json
 * @returns {object} validated config (same object, just checked)
 */
export function validateEnergyConfig(configObj) {
  if (!configObj || typeof configObj !== 'object') {
    throw new Error('Energy config must be a non-null object');
  }
  if (!configObj.regions || typeof configObj.regions !== 'object') {
    throw new Error('Energy config must have a "regions" object');
  }
  if (!configObj.configVersion || typeof configObj.configVersion !== 'string') {
    throw new Error('Energy config must have a "configVersion" string');
  }
  return configObj;
}

// -------------------------------------------------------------------------
// Region listing (for UI display / validation)
// -------------------------------------------------------------------------

/**
 * List available regions from config.
 * @param {object} config — energy config
 * @returns {Array<{regionId, regionName, discom, tariffName}>}
 */
export function listRegions(config) {
  return Object.entries(config.regions || {}).map(([id, r]) => ({
    regionId: id,
    regionName: r.regionName,
    discom: r.discom,
    tariffName: r.tariffName,
    tariffVersion: r.tariffVersion,
  }));
}
