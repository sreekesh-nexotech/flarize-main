/**
 * SUBSIDY ENGINE  (Phase 3, V1 — PM Surya Ghar CFA)
 *
 * Pure calculation module — government subsidy eligibility and amount.
 *
 * No React, no DOM, no fetch, no pricing, no BOM, no procurement,
 * no savings, no GST, no margin, no EMI. Zero dependencies beyond
 * JavaScript builtins.
 *
 * Supported schemes:
 *   - PM Surya Ghar: Muft Bijli Yojana — residential CFA
 *   - PM Surya Ghar: GHS/RWA — group housing CFA
 *
 * Subsidy formula (residential):
 *   if kW ≤ 2:   subsidy = kW × 30,000
 *   if kW ≤ 3:   subsidy = 60,000 + (kW − 2) × 18,000
 *   if kW > 3:   subsidy = 78,000 (capped)
 *   if kW > 10:  INELIGIBLE
 *
 * Subsidy formula (GHS/RWA):
 *   perHouseKw = min(kW, maxKwPerHouse)
 *   subsidy = perHouseKw × 18,000 × houses
 *   capped at maxCommunityKw × 18,000
 *
 * State top-up: Kerala = ₹0. Central CFA only.
 *
 * This module does NOT calculate: quotation price, BOM cost,
 * procurement cost, margin, selling price, GST, or post-subsidy
 * investment. It receives system parameters and returns subsidy
 * eligibility and amount.
 *
 * @module subsidyEngine
 */

// ---- Version + constants ----------------------------------------------------

export const SUBSIDY_ENGINE_VERSION = '1.0.0';
export const SUBSIDY_SOURCE = 'SUBSIDY_ENGINE';
export const SUBSIDY_STATUS_LIVE = 'LIVE';

export const SUBSIDY_ERROR = Object.freeze({
  INVALID_INPUT: 'INVALID_INPUT',
  INELIGIBLE_CAPACITY: 'INELIGIBLE_CAPACITY',
  INELIGIBLE_CONNECTION: 'INELIGIBLE_CONNECTION',
  INELIGIBLE_DCR: 'INELIGIBLE_DCR',
  MISSING_CONFIG: 'MISSING_CONFIG',
  GIVE_IT_UP: 'GIVE_IT_UP',
  NO_SUBSIDY: 'NO_SUBSIDY',
});

export const ELIGIBILITY_STATUS = Object.freeze({
  ELIGIBLE: 'ELIGIBLE',
  INELIGIBLE: 'INELIGIBLE',
  GIVE_IT_UP: 'GIVE_IT_UP',
});

// ---- Core calculation -------------------------------------------------------

/**
 * Calculate government subsidy eligibility and amount.
 *
 * @param {object} params
 * @param {number} params.systemSizeKw — installed system capacity in kW
 * @param {string} [params.subsidyType='residential'] — 'residential' | 'ghs' | 'none'
 * @param {number} [params.ghsHouses=1] — number of houses (GHS only)
 * @param {string} [params.panelType='DCR'] — 'DCR' | 'non-DCR'
 * @param {string} [params.connectionType='domestic'] — 'domestic' | 'commercial' | etc.
 * @param {object} [params.subsidyConfig] — parsed subsidy-config.json
 * @returns {object} subsidy result
 */
export function calculateSubsidy({
  systemSizeKw = null,
  subsidyType = 'residential',
  ghsHouses = 1,
  panelType = 'DCR',
  connectionType = 'domestic',
  subsidyConfig = null,
} = {}) {
  const now = new Date().toISOString();

  // ---- No subsidy requested ----
  if (subsidyType === 'none' || !subsidyType) {
    return noSubsidy(SUBSIDY_ERROR.NO_SUBSIDY,
      'Subsidy type is "none" — no subsidy requested.', now);
  }

  // ---- Validate config ----
  if (!subsidyConfig || typeof subsidyConfig !== 'object') {
    return blocked(SUBSIDY_ERROR.MISSING_CONFIG,
      'No subsidy configuration provided.', now);
  }

  // ---- Validate system size ----
  if (systemSizeKw == null || typeof systemSizeKw !== 'number' || systemSizeKw <= 0) {
    return blocked(SUBSIDY_ERROR.INVALID_INPUT,
      'System size must be a positive number.', now);
  }

  // ---- Check connection type ----
  if (connectionType !== 'domestic') {
    return ineligible(SUBSIDY_ERROR.INELIGIBLE_CONNECTION,
      `Connection type "${connectionType}" is not eligible for PM Surya Ghar subsidy. Only domestic connections qualify.`,
      now, subsidyConfig, subsidyType);
  }

  // ---- GIVE_IT_UP: non-DCR panels with subsidy-eligible type ----
  const dcrNormalized = (panelType || '').toString().toUpperCase();
  const isDCR = dcrNormalized === 'DCR';
  const dcrRequired = subsidyConfig.dcr?.required !== false;

  if (dcrRequired && !isDCR && (subsidyType === 'residential' || subsidyType === 'ghs')) {
    return giveItUp(
      'Non-DCR panels selected. Subsidy forfeited under "Give It Up" provision. Net metering benefits retained.',
      now, subsidyConfig, subsidyType, systemSizeKw);
  }

  // ---- Route by subsidy type ----
  if (subsidyType === 'residential') {
    return calculateResidential(systemSizeKw, subsidyConfig, now);
  }

  if (subsidyType === 'ghs') {
    return calculateGHS(systemSizeKw, ghsHouses, subsidyConfig, now);
  }

  // ---- Unknown subsidy type ----
  return blocked(SUBSIDY_ERROR.INVALID_INPUT,
    `Unknown subsidy type: "${subsidyType}". Expected "residential", "ghs", or "none".`, now);
}

// ---- Residential calculation ------------------------------------------------

function calculateResidential(systemSizeKw, config, calculatedAt) {
  const residential = config.residential;
  if (!residential) {
    return blocked(SUBSIDY_ERROR.MISSING_CONFIG,
      'Subsidy config missing residential section.', calculatedAt);
  }

  const maxCapacity = residential.maxCapacityKw ?? 10;
  const minCapacity = residential.minCapacityKw ?? 1;
  const maxSubsidy = residential.maxSubsidy ?? 78000;
  const tiers = residential.tiers || [];

  // ---- Capacity check ----
  if (systemSizeKw > maxCapacity) {
    return ineligible(SUBSIDY_ERROR.INELIGIBLE_CAPACITY,
      `System size ${systemSizeKw} kW exceeds maximum eligible capacity of ${maxCapacity} kW for residential subsidy.`,
      calculatedAt, config, 'residential');
  }

  if (systemSizeKw < minCapacity) {
    return ineligible(SUBSIDY_ERROR.INELIGIBLE_CAPACITY,
      `System size ${systemSizeKw} kW is below minimum eligible capacity of ${minCapacity} kW for residential subsidy.`,
      calculatedAt, config, 'residential');
  }

  // ---- Tiered calculation ----
  let subsidy = 0;
  let remaining = systemSizeKw;

  for (const tier of tiers) {
    if (remaining <= 0) break;
    const prevCap = (tiers.indexOf(tier) === 0) ? 0 : tiers[tiers.indexOf(tier) - 1].upToKw;
    const bandWidth = tier.upToKw - prevCap;
    const unitsInBand = Math.min(remaining, bandWidth);
    subsidy += unitsInBand * tier.ratePerKw;
    remaining -= unitsInBand;
  }

  // Cap at maxSubsidy
  subsidy = Math.min(subsidy, maxSubsidy);

  // Round to whole rupees
  subsidy = Math.round(subsidy);

  const eligibleCapacityKw = Math.min(systemSizeKw, maxCapacity);
  const stateTopUp = config.stateTopUp?.kerala ?? 0;

  return buildResult({
    subsidyType: 'residential',
    eligibleCapacityKw,
    centralSubsidy: subsidy,
    stateSubsidy: stateTopUp,
    totalSubsidy: subsidy + stateTopUp,
    eligibilityStatus: ELIGIBILITY_STATUS.ELIGIBLE,
    calculatedAt,
    config,
  });
}

// ---- GHS/RWA calculation ----------------------------------------------------

function calculateGHS(systemSizeKw, ghsHouses, config, calculatedAt) {
  const ghs = config.ghs;
  if (!ghs) {
    return blocked(SUBSIDY_ERROR.MISSING_CONFIG,
      'Subsidy config missing GHS section.', calculatedAt);
  }

  // ---- Validate houses ----
  if (ghsHouses == null || typeof ghsHouses !== 'number' || ghsHouses <= 0 || !Number.isInteger(ghsHouses)) {
    return blocked(SUBSIDY_ERROR.INVALID_INPUT,
      'GHS houses must be a positive integer.', calculatedAt);
  }

  const ratePerKw = ghs.ratePerKw ?? 18000;
  const maxKwPerHouse = ghs.maxKwPerHouse ?? 3;
  const maxCommunityKw = ghs.maxCommunityKw ?? 500;

  // Per-house cap
  const perHouseKw = Math.min(systemSizeKw, maxKwPerHouse);

  // Total eligible kW
  const totalEligibleKw = Math.min(perHouseKw * ghsHouses, maxCommunityKw);

  // Subsidy amount
  let subsidy = Math.round(totalEligibleKw * ratePerKw);

  const stateTopUp = config.stateTopUp?.kerala ?? 0;

  return buildResult({
    subsidyType: 'ghs',
    eligibleCapacityKw: perHouseKw,
    centralSubsidy: subsidy,
    stateSubsidy: stateTopUp,
    totalSubsidy: subsidy + stateTopUp,
    eligibilityStatus: ELIGIBILITY_STATUS.ELIGIBLE,
    calculatedAt,
    config,
    ghsHouses,
    ghsTotalEligibleKw: totalEligibleKw,
  });
}

// ---- Result builders --------------------------------------------------------

function buildResult({
  subsidyType, eligibleCapacityKw, centralSubsidy, stateSubsidy, totalSubsidy,
  eligibilityStatus, calculatedAt, config, ghsHouses = null, ghsTotalEligibleKw = null,
}) {
  const scheme = config.scheme || {};
  return {
    source: SUBSIDY_SOURCE,
    status: SUBSIDY_STATUS_LIVE,
    available: true,
    engineVersion: SUBSIDY_ENGINE_VERSION,
    treatment: 'ENGINE_RESULT',

    // Subsidy type
    subsidyType,

    // Capacity
    eligibleCapacityKw,

    // Amounts
    centralSubsidy,
    stateSubsidy,
    totalSubsidy,
    subsidyAmount: totalSubsidy, // alias for payload compatibility

    // Eligibility
    eligibilityStatus,
    eligibilityReason: null,
    dcrRequired: config.dcr?.required !== false,

    // GHS-specific
    ...(subsidyType === 'ghs' ? {
      ghsHouses,
      ghsTotalEligibleKw,
    } : {}),

    // Scheme metadata
    schemeName: scheme.name ?? 'PM Surya Ghar: Muft Bijli Yojana',
    schemeVersion: scheme.schemeVersion ?? 'PMSG_2024_V1',
    calculatedAt,

    // Post-subsidy — NOT calculated here
    postSubsidyInvestment: null,

    // Assumptions
    assumptions: {
      subsidyBasis: 'CENTRAL_CFA_ONLY — no Kerala state top-up',
      stateTopUp: stateSubsidy,
      dcrRequirement: config.dcr?.required !== false,
      effectivePeriod: scheme.effectivePeriod ?? null,
    },
  };
}

function blocked(code, reason, calculatedAt) {
  return {
    source: SUBSIDY_SOURCE,
    status: code,
    available: false,
    reason,
    engineVersion: SUBSIDY_ENGINE_VERSION,
    eligibilityStatus: null,
    calculatedAt,
  };
}

function ineligible(code, reason, calculatedAt, config, subsidyType) {
  const scheme = config?.scheme || {};
  return {
    source: SUBSIDY_SOURCE,
    status: code,
    available: false,
    reason,
    engineVersion: SUBSIDY_ENGINE_VERSION,
    subsidyType,
    eligibilityStatus: ELIGIBILITY_STATUS.INELIGIBLE,
    eligibilityReason: reason,
    centralSubsidy: 0,
    stateSubsidy: 0,
    totalSubsidy: 0,
    subsidyAmount: 0,
    dcrRequired: config?.dcr?.required !== false,
    schemeName: scheme.name ?? 'PM Surya Ghar: Muft Bijli Yojana',
    schemeVersion: scheme.schemeVersion ?? 'PMSG_2024_V1',
    calculatedAt,
    postSubsidyInvestment: null,
  };
}

function giveItUp(reason, calculatedAt, config, subsidyType, systemSizeKw) {
  const scheme = config?.scheme || {};
  return {
    source: SUBSIDY_SOURCE,
    status: SUBSIDY_ERROR.GIVE_IT_UP,
    available: false,
    reason,
    engineVersion: SUBSIDY_ENGINE_VERSION,
    subsidyType,
    eligibleCapacityKw: systemSizeKw,
    eligibilityStatus: ELIGIBILITY_STATUS.GIVE_IT_UP,
    eligibilityReason: reason,
    centralSubsidy: 0,
    stateSubsidy: 0,
    totalSubsidy: 0,
    subsidyAmount: 0,
    dcrRequired: false, // waived under Give It Up
    schemeName: scheme.name ?? 'PM Surya Ghar: Muft Bijli Yojana',
    schemeVersion: scheme.schemeVersion ?? 'PMSG_2024_V1',
    calculatedAt,
    postSubsidyInvestment: null,
    assumptions: {
      subsidyBasis: 'GIVE_IT_UP — consumer forfeited subsidy, non-DCR panels allowed',
      stateTopUp: 0,
      dcrRequirement: false,
    },
  };
}

function noSubsidy(code, reason, calculatedAt) {
  return {
    source: SUBSIDY_SOURCE,
    status: code,
    available: false,
    reason,
    engineVersion: SUBSIDY_ENGINE_VERSION,
    subsidyType: 'none',
    eligibilityStatus: null,
    centralSubsidy: 0,
    stateSubsidy: 0,
    totalSubsidy: 0,
    subsidyAmount: 0,
    calculatedAt,
    postSubsidyInvestment: null,
  };
}

// ---- Configuration validation -----------------------------------------------

/**
 * Validate subsidy config structure.
 *
 * @param {object} config — parsed subsidy-config.json
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateSubsidyConfig(config) {
  const errors = [];
  if (!config || typeof config !== 'object') {
    return { valid: false, errors: ['Config must be a non-null object'] };
  }

  if (!config.residential) {
    errors.push('Missing residential section');
  } else {
    if (!Array.isArray(config.residential.tiers) || config.residential.tiers.length === 0) {
      errors.push('residential.tiers must be a non-empty array');
    }
    if (config.residential.maxSubsidy == null || config.residential.maxSubsidy <= 0) {
      errors.push('residential.maxSubsidy must be a positive number');
    }
    if (config.residential.maxCapacityKw == null || config.residential.maxCapacityKw <= 0) {
      errors.push('residential.maxCapacityKw must be a positive number');
    }
  }

  if (!config.ghs) {
    errors.push('Missing GHS section');
  } else {
    if (config.ghs.ratePerKw == null || config.ghs.ratePerKw <= 0) {
      errors.push('ghs.ratePerKw must be a positive number');
    }
    if (config.ghs.maxKwPerHouse == null || config.ghs.maxKwPerHouse <= 0) {
      errors.push('ghs.maxKwPerHouse must be a positive number');
    }
    if (config.ghs.maxCommunityKw == null || config.ghs.maxCommunityKw <= 0) {
      errors.push('ghs.maxCommunityKw must be a positive number');
    }
  }

  if (!config.scheme) {
    errors.push('Missing scheme section');
  }

  return { valid: errors.length === 0, errors };
}
