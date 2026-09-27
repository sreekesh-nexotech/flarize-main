/**
 * UPGRADE ASSESSMENT + ENGINEERING REQUEST PATH.  (Decision C10, approved 2026-08-16)
 *
 * C10 as originally logged approved a fixed set of upgrade paths and forbade
 * heuristic upgrade design. The 2026-08-16 Engineering clarification adds the
 * rules this module implements. It does NOT change the earlier decision:
 * explicit only, blocked otherwise, never extrapolated.
 *
 * TWO SCENARIOS, NEVER CONFLATED
 *   FUTURE_READY    — install ~3 kW now, prepare for a later 6 kW
 *   EXISTING_SYSTEM — a 3 kW plant already exists and is being upgraded to 6 kW
 *
 * WHAT THIS MODULE WILL NOT DO
 *   - no nearest-path selection, no proportional scaling, no fallback quantity
 *   - no BOM quantity is invented for structure, cable, ACDB, meter, inverter,
 *     panel or protection. `catalog.bomTemplates.upgrade.fixedItems` defines
 *     `3_5`, `5_8`, `5_10`, `8_10` and nothing else; `3_6` and `3_8` therefore
 *     resolve to UNRESOLVED with the path key named — never to a scaled figure
 *     and never to zero
 *   - no silent component substitution
 *   - no assumption that an existing 6 kW inverter may be retained
 *
 * TRI-STATE, EVERYWHERE
 *   Every check returns PASS, FAIL or UNRESOLVED. UNRESOLVED is not a soft pass:
 *   it names the missing input and routes the configuration to a Project Head /
 *   Engineering request. A check that cannot be evaluated never yields
 *   retention, never yields a quantity and never yields a verdict.
 *
 * BOUNDARY
 *   Assessment and request lifecycle. It selects no component, prices nothing,
 *   locks nothing and writes no BOM. It reads the catalog only through data the
 *   caller passes in. No clock: every `at` is caller-supplied.
 */

import { APPROVED_UPGRADE_PATHS, buildUpgradeIdentity } from './upgradeModel.js';
import { assertCan, can, CAPABILITY } from './rbac.js';

export const UPGRADE_ASSESSMENT_VERSION = 'upgradeAssessment.1';

export const SCENARIO = {
  FUTURE_READY: 'FUTURE_READY',
  EXISTING_SYSTEM: 'EXISTING_SYSTEM',
};

export const CHECK = {
  PASS: 'PASS',
  WARNING: 'WARNING',
  FAIL: 'FAIL',
  UNRESOLVED: 'UNRESOLVED',
};

/**
 * C10 closure §6 — DC/AC verdict.
 *   VALID      within the manufacturer maximum and within any preferred range
 *   WARNING    the manufacturer permits it, but it sits outside the preferred range
 *   BLOCKED    it exceeds the manufacturer specification — a hard electrical ceiling
 *   UNRESOLVED required manufacturer data is unavailable
 * The Flarize preferred range NEVER raises the manufacturer maximum.
 */
export const DCAC_STATUS = {
  VALID: 'VALID',
  WARNING: 'WARNING',
  BLOCKED: 'BLOCKED',
  UNRESOLVED: 'UNRESOLVED',
};

/** C10 closure §9 — how every affected component resolves. */
export const DISPOSITION = {
  RETAIN: 'RETAIN',
  REPLACE: 'REPLACE',
  ADD: 'ADD',
  ENGINEERING_REVIEW: 'ENGINEERING_REVIEW',
};

/**
 * C10 closure §3 — the wattage class boundary the Project Head fixed.
 * Sales already screens panel health; this module adds no second questionnaire.
 * It consumes the screening result and the panel's own wattage, nothing else.
 */
export const PANEL_RETENTION_MIN_WATT = 500;

export const PANEL_HEALTH = { HEALTHY: 'HEALTHY', POOR: 'POOR' };

/**
 * C10 closure §8 — PRELIMINARY Sales-quotation allowances. These are ESTIMATES
 * for a preliminary quotation, not engineered quantities: the Project Head
 * adjusts the BOM after site and configuration verification. Only the figures
 * the decision actually states appear here. Nothing else is given a number.
 */
export const PRELIMINARY_ALLOWANCE = Object.freeze({
  DC_CABLE_TOTAL_M: 30,
  DC_CABLE_POSITIVE_M: 15,
  DC_CABLE_NEGATIVE_M: 15,
  MC4_PAIRS_PER_NEW_STRING: 3,
});

export const ITEM_BASIS = {
  PRELIMINARY_ALLOWANCE: 'PRELIMINARY_ALLOWANCE',
  CATALOG_APPROVED: 'CATALOG_APPROVED',
  QUANTITY_NOT_DECIDED: 'QUANTITY_NOT_DECIDED',
};

export const ASSESSMENT_STATUS = {
  RESOLVED: 'RESOLVED',                                   // every check passed, and every quantity is approved
  ENGINEERING_REQUEST_REQUIRED: 'ENGINEERING_REQUEST_REQUIRED',
  BLOCKED: 'BLOCKED',                                     // a check failed outright
};

/** Named inputs this module refuses to invent. */
export const MISSING_INPUT = {
  DC_AC_RATIO_POLICY: 'DC_AC_RATIO_POLICY',
  EXISTING_INVERTER: 'EXISTING_INVERTER',
  EXISTING_PANEL: 'EXISTING_PANEL',
  EXISTING_STRING_LAYOUT: 'EXISTING_STRING_LAYOUT',
  EXISTING_STRUCTURE_ADEQUACY: 'EXISTING_STRUCTURE_ADEQUACY',
  MPPT_UTILISATION: 'MPPT_UTILISATION',
  INVERTER_ELECTRICAL_LIMITS: 'INVERTER_ELECTRICAL_LIMITS',
  PANEL_ELECTRICAL_CHARACTERISTICS: 'PANEL_ELECTRICAL_CHARACTERISTICS',
  UPGRADE_FIXED_ITEM_QUANTITIES: 'UPGRADE_FIXED_ITEM_QUANTITIES',
  THREE_PHASE_AC_SIDE_QUANTITIES: 'THREE_PHASE_AC_SIDE_QUANTITIES',
  ADDITIONAL_STRUCTURE_QUANTITY: 'ADDITIONAL_STRUCTURE_QUANTITY',
  MANUFACTURER_DCAC_LIMIT: 'MANUFACTURER_DCAC_LIMIT',
  PANEL_HEALTH_SCREENING: 'PANEL_HEALTH_SCREENING',
  APPROVED_TARGET_INVERTER: 'APPROVED_TARGET_INVERTER',
  AC_SIDE_PRELIMINARY_QUANTITIES: 'AC_SIDE_PRELIMINARY_QUANTITIES',
};

export const FINDING = {
  DCAC_POLICY_ABSENT: 'UPG-C10-001',
  DCAC_OUT_OF_RANGE: 'UPG-C10-002',
  INVERTER_PHASE_UNSUITABLE: 'UPG-C10-003',
  INVERTER_CAPACITY_UNSUITABLE: 'UPG-C10-004',
  INVERTER_LIMITS_UNKNOWN: 'UPG-C10-005',
  MPPT_NONE_FREE: 'UPG-C10-006',
  MPPT_UTILISATION_UNKNOWN: 'UPG-C10-007',
  MPPT_CURRENT_EXCEEDED: 'UPG-C10-008',
  MPPT_VOLTAGE_WINDOW: 'UPG-C10-009',
  STRING_LAYOUT_UNDECLARED: 'UPG-C10-010',
  MIXED_PANEL_SAME_STRING_FORBIDDEN: 'UPG-C10-011',
  STRUCTURE_ADEQUACY_UNKNOWN: 'UPG-C10-012',
  ADDITIONAL_STRUCTURE_REQUIRED: 'UPG-C10-013',
  THREE_PHASE_REQUIRED_ABOVE_5KW: 'UPG-C10-014',
  AC_SIDE_REEVALUATION_REQUIRED: 'UPG-C10-015',
  UPGRADE_PATH_NOT_APPROVED: 'UPG-C10-016',
  MANUFACTURER_DCAC_LIMIT_UNKNOWN: 'UPG-C10-021',
  DCAC_EXCEEDS_MANUFACTURER: 'UPG-C10-022',
  DCAC_OUTSIDE_PREFERRED: 'UPG-C10-023',
  PANEL_RETAINED: 'UPG-C10-024',
  PANEL_REPLACEMENT_REQUIRED: 'UPG-C10-025',
  PANEL_HEALTH_NOT_SCREENED: 'UPG-C10-026',
  TARGET_PANEL_CONFIG_UNRESOLVED: 'UPG-C10-027',
  PRELIMINARY_ALLOWANCE_APPLIED: 'UPG-C10-028',
  AC_SIDE_QUANTITY_NOT_DECIDED: 'UPG-C10-029',
  TARGET_INVERTER_NOT_SUPPLIED: 'UPG-C10-030',
  FIXED_ITEMS_NOT_DEFINED: 'UPG-C10-017',
  INVERTER_RETAINED: 'UPG-C10-018',
  INVERTER_REPLACEMENT_REQUIRED: 'UPG-C10-019',
  SALES_MAY_NOT_ENGINEER: 'UPG-C10-020',
};

/**
 * C10 §C — the approved phase rule.
 * Up to 5 kW may be single- or three-phase. Above 5 kW the system is treated as
 * three-phase. This is a decided business rule, so it is implemented; the AC-side
 * BOM QUANTITIES it implies are NOT decided and are never fabricated.
 */
export const SINGLE_PHASE_MAX_KW = 5;
export const PHASE = { SINGLE: '1P', THREE: '3P' };

/** AC-side items a >5 kW upgrade must have re-evaluated. Named, never counted. */
export const AC_SIDE_REEVALUATION_ITEMS = Object.freeze([
  'ACDB', 'AC_CABLE', 'AC_ISOLATOR', 'METER', 'KSEB_CONNECTION',
]);

const check = (id, status, message, detail = null) =>
  Object.freeze({ id, status, message, detail });

const unresolvedInputs = (checks) => Object.freeze([...new Set(
  checks.filter(c => c.status === CHECK.UNRESOLVED)
    .flatMap(c => c.detail?.missingInputs || []))]);

// ---------------------------------------------------------------------------
// C10 §C — phase requirement
// ---------------------------------------------------------------------------

/**
 * Required phase for a target size. Above 5 kW → three-phase, always.
 * The AC-side components that must be re-evaluated are NAMED; no quantity, no
 * component id and no meter BOM line is produced here.
 */
export function assessPhaseRequirement({ targetKw, requestedPhase = null } = {}) {
  const checks = [];
  if (targetKw == null) {
    checks.push(check(FINDING.THREE_PHASE_REQUIRED_ABOVE_5KW, CHECK.UNRESOLVED,
      'Target size not supplied; the phase requirement cannot be determined.',
      { missingInputs: ['targetKw'] }));
    return Object.freeze({ requiredPhase: null, checks: Object.freeze(checks), acSideReevaluation: null });
  }

  const requiredPhase = Number(targetKw) > SINGLE_PHASE_MAX_KW ? PHASE.THREE : null;

  if (requiredPhase === PHASE.THREE) {
    checks.push(check(FINDING.THREE_PHASE_REQUIRED_ABOVE_5KW, CHECK.PASS,
      `${targetKw} kW exceeds ${SINGLE_PHASE_MAX_KW} kW, so the system is three-phase (C10 §C).`,
      { requiredPhase: PHASE.THREE, requestedPhase }));
    if (requestedPhase && requestedPhase !== PHASE.THREE) {
      checks.push(check(FINDING.THREE_PHASE_REQUIRED_ABOVE_5KW, CHECK.FAIL,
        `Requested phase ${requestedPhase} conflicts with the three-phase requirement above ${SINGLE_PHASE_MAX_KW} kW. ` +
        'The selection is blocked; it is never silently converted (C11 principle).',
        { requiredPhase: PHASE.THREE, requestedPhase }));
    }
    checks.push(check(FINDING.AC_SIDE_REEVALUATION_REQUIRED, CHECK.UNRESOLVED,
      'The three-phase AC side must be re-evaluated. No quantity exists in the approved data for these items, ' +
      'so none is produced here.',
      { items: AC_SIDE_REEVALUATION_ITEMS, missingInputs: [MISSING_INPUT.THREE_PHASE_AC_SIDE_QUANTITIES] }));
  } else {
    checks.push(check(FINDING.THREE_PHASE_REQUIRED_ABOVE_5KW, CHECK.PASS,
      `${targetKw} kW is within ${SINGLE_PHASE_MAX_KW} kW; single- or three-phase both remain permissible per the applicable configuration.`,
      { requiredPhase: null, requestedPhase }));
  }

  return Object.freeze({
    requiredPhase,
    requestedPhase,
    acSideReevaluation: requiredPhase === PHASE.THREE ? AC_SIDE_REEVALUATION_ITEMS : null,
    checks: Object.freeze(checks),
  });
}

// ---------------------------------------------------------------------------
// DC/AC ratio
// ---------------------------------------------------------------------------

/**
 * DC/AC ratio for a stated array against a stated inverter.
 *
 * The RATIO is arithmetic on values the caller supplied (panel count × panel
 * watt ÷ inverter watt) — it invents nothing. The ACCEPTABLE RANGE is an
 * engineering policy and does NOT exist in the catalog, so it must be supplied.
 * Without it this returns UNRESOLVED naming DC_AC_RATIO_POLICY. It never assumes
 * a limit and never treats "no policy" as a pass.
 */
export function assessDcAcRatio({ panel, panelCount, inverter, policy = null, manufacturerMaxDcAc = null, label = 'system' } = {}) {
  const missing = [];
  if (!panel || panel.watt == null) missing.push(MISSING_INPUT.PANEL_ELECTRICAL_CHARACTERISTICS);
  if (panelCount == null) missing.push('panelCount');
  if (!inverter || inverter.kw == null) missing.push(MISSING_INPUT.EXISTING_INVERTER);
  if (missing.length) {
    return Object.freeze({ ratio: null, check: check(FINDING.DCAC_OUT_OF_RANGE, CHECK.UNRESOLVED,
      `DC/AC ratio for the ${label} cannot be evaluated.`, { missingInputs: missing, label }) });
  }

  const dcWatt = Number(panel.watt) * Number(panelCount);
  const acWatt = Number(inverter.kw) * 1000;
  const ratio = Math.round((dcWatt / acWatt) * 10000) / 10000;

  // C10 closure §6 — the manufacturer specification is the hard ceiling. It is
  // read from the inverter record when the manufacturer supplied it, or from an
  // explicit caller value. It is NEVER assumed and NEVER derived.
  const ceiling = manufacturerMaxDcAc ?? inverter.maxDcAcRatio ?? null;

  if (ceiling != null && ratio > Number(ceiling)) {
    return Object.freeze({
      ratio, dcAcStatus: DCAC_STATUS.BLOCKED, manufacturerMaxDcAc: Number(ceiling),
      policyVersion: policy?.version ?? null,
      check: check(FINDING.DCAC_EXCEEDS_MANUFACTURER, CHECK.FAIL,
        `DC/AC ratio for the ${label} is ${ratio}, above the manufacturer maximum ${ceiling}. ` +
        'The manufacturer specification is a hard electrical ceiling and no preferred range may raise it.',
        { ratio, label, manufacturerMaxDcAc: Number(ceiling) }),
    });
  }

  if (!policy || policy.minRatio == null || policy.maxRatio == null) {
    if (ceiling != null) {
      // Within the manufacturer specification, with no preferred range declared.
      return Object.freeze({
        ratio, dcAcStatus: DCAC_STATUS.VALID, manufacturerMaxDcAc: Number(ceiling), policyVersion: null,
        check: check(FINDING.DCAC_OUT_OF_RANGE, CHECK.PASS,
          `DC/AC ratio for the ${label} is ${ratio}, within the manufacturer maximum ${ceiling}. ` +
          'No Flarize preferred range is declared, so none is applied.',
          { ratio, label, manufacturerMaxDcAc: Number(ceiling) }),
      });
    }
    return Object.freeze({ ratio, dcAcStatus: DCAC_STATUS.UNRESOLVED, manufacturerMaxDcAc: null,
      check: check(FINDING.DCAC_POLICY_ABSENT, CHECK.UNRESOLVED,
      `DC/AC ratio for the ${label} is ${ratio}, but no approved acceptable range exists. ` +
      'The ratio is reported; it is not judged, and "no policy" is not a pass.',
      { ratio, label, manufacturerLimitAvailable: false,
        missingInputs: [MISSING_INPUT.DC_AC_RATIO_POLICY] }) });
  }

  const withinPreferred = ratio >= policy.minRatio && ratio <= policy.maxRatio;
  if (withinPreferred) {
    return Object.freeze({
      ratio, dcAcStatus: DCAC_STATUS.VALID,
      manufacturerMaxDcAc: ceiling == null ? null : Number(ceiling),
      policyVersion: policy.version ?? null,
      check: check(FINDING.DCAC_OUT_OF_RANGE, CHECK.PASS,
        `DC/AC ratio for the ${label} is ${ratio} against the approved range ${policy.minRatio}–${policy.maxRatio}.`,
        { ratio, label, policy }),
    });
  }

  // Outside the preferred range. Only the manufacturer specification can tell us
  // whether that is permitted at all — without it this is not downgraded to a
  // warning, because nothing proves the manufacturer allows it.
  if (ceiling == null) {
    return Object.freeze({
      ratio, dcAcStatus: DCAC_STATUS.UNRESOLVED, manufacturerMaxDcAc: null,
      policyVersion: policy.version ?? null,
      check: check(FINDING.DCAC_OUT_OF_RANGE, CHECK.FAIL,
        `DC/AC ratio for the ${label} is ${ratio} against the approved range ${policy.minRatio}–${policy.maxRatio}. ` +
        'No manufacturer maximum is available, so it cannot be shown that the manufacturer permits it.',
        { ratio, label, policy, missingInputs: [MISSING_INPUT.MANUFACTURER_DCAC_LIMIT] }),
    });
  }

  return Object.freeze({
    ratio, dcAcStatus: DCAC_STATUS.WARNING, manufacturerMaxDcAc: Number(ceiling),
    policyVersion: policy.version ?? null,
    check: check(FINDING.DCAC_OUTSIDE_PREFERRED, CHECK.WARNING,
      `DC/AC ratio for the ${label} is ${ratio}. The manufacturer permits it (maximum ${ceiling}) but it sits ` +
      `outside the Flarize preferred range ${policy.minRatio}–${policy.maxRatio}.`,
      { ratio, label, policy, manufacturerMaxDcAc: Number(ceiling) }),
  });
}

// ---------------------------------------------------------------------------
// C10 closure §3 — existing panels
// ---------------------------------------------------------------------------

/**
 * Disposition of the panels the customer already owns.
 *
 * Sales has already screened panel health, so the screening RESULT is an input.
 * No second questionnaire is introduced. The rule is exactly the one the
 * Project Head locked: healthy panels at or above the wattage boundary are
 * normally retained; poor or below-boundary panels are normally replaced; a
 * declared space/string/MPPT constraint can force replacement anyway.
 *
 * Removed panels stay the customer's property: `pricingImpact` is always NONE
 * and no buyback, trade-in or negative quantity is ever produced.
 */
export function assessExistingPanels({
  existingPanel = null, existingPanelCount = null,
  healthScreening = null, constraintForcesReplacement = false,
} = {}) {
  const checks = [];
  if (!existingPanel || existingPanel.watt == null) {
    checks.push(check(FINDING.PANEL_REPLACEMENT_REQUIRED, CHECK.UNRESOLVED,
      'The existing panel is not identified; its disposition cannot be decided.',
      { missingInputs: [MISSING_INPUT.EXISTING_PANEL] }));
    return frozenPanelDisposition(DISPOSITION.ENGINEERING_REVIEW, null, existingPanelCount, checks);
  }
  if (healthScreening !== PANEL_HEALTH.HEALTHY && healthScreening !== PANEL_HEALTH.POOR) {
    checks.push(check(FINDING.PANEL_HEALTH_NOT_SCREENED, CHECK.UNRESOLVED,
      'Sales has not recorded a panel health screening result. This module does not ask its own health ' +
      'questions and does not assume a result.',
      { missingInputs: [MISSING_INPUT.PANEL_HEALTH_SCREENING] }));
    return frozenPanelDisposition(DISPOSITION.ENGINEERING_REVIEW, existingPanel, existingPanelCount, checks);
  }

  const watt = Number(existingPanel.watt);
  const healthy = healthScreening === PANEL_HEALTH.HEALTHY;
  const wattOk = watt >= PANEL_RETENTION_MIN_WATT;

  if (constraintForcesReplacement) {
    checks.push(check(FINDING.PANEL_REPLACEMENT_REQUIRED, CHECK.PASS,
      'A declared space, string or MPPT constraint requires the existing panels to be replaced.',
      { existingPanelId: existingPanel.id, watt, constraint: true }));
    return frozenPanelDisposition(DISPOSITION.REPLACE, existingPanel, existingPanelCount, checks);
  }
  if (healthy && wattOk) {
    checks.push(check(FINDING.PANEL_RETAINED, CHECK.PASS,
      `Existing panels are screened HEALTHY at ${watt} W, at or above the ${PANEL_RETENTION_MIN_WATT} W boundary. ` +
      'They are retained.', { existingPanelId: existingPanel.id, watt }));
    return frozenPanelDisposition(DISPOSITION.RETAIN, existingPanel, existingPanelCount, checks);
  }
  checks.push(check(FINDING.PANEL_REPLACEMENT_REQUIRED, CHECK.PASS,
    `Existing panels are ${healthy ? 'healthy' : 'screened POOR'} at ${watt} W` +
    `${wattOk ? '' : `, below the ${PANEL_RETENTION_MIN_WATT} W boundary`}. They are replaced.`,
    { existingPanelId: existingPanel.id, watt, healthScreening }));
  return frozenPanelDisposition(DISPOSITION.REPLACE, existingPanel, existingPanelCount, checks);
}

function frozenPanelDisposition(disposition, panel, count, checks) {
  const removed = disposition === DISPOSITION.REPLACE;
  return Object.freeze({
    disposition,
    componentId: panel?.id ?? null,
    quantity: count,                       // the count the caller declared, unchanged
    removedPanelsOwnedByCustomer: removed ? true : false,
    pricingImpact: 'NONE',
    buybackValue: null,
    tradeInValue: null,
    note: 'Panels removed from an existing plant remain the customer\'s property. They carry no buyback or ' +
      'trade-in value in the engineering BOM and never appear as a negative quantity.',
    checks: Object.freeze(checks),
  });
}

// ---------------------------------------------------------------------------
// C10 closure §5 — target panel configuration
// ---------------------------------------------------------------------------

/**
 * Candidate panel counts for a target capacity, judged ELECTRICALLY.
 *
 * Capacity deviation alone is not a selection rule: every candidate is evaluated
 * against the manufacturer DC/AC ceiling and the preferred range, and only
 * electrically permitted candidates may be proposed. If none is permitted — or
 * if the manufacturer limit is unavailable — the configuration is unresolved and
 * goes to Engineering. Nothing is ever taken from another upgrade path.
 */
export function proposeTargetPanelConfiguration({
  targetKw = null, panel = null, inverter = null,
  manufacturerMaxDcAc = null, policy = null, searchWidth = 3,
} = {}) {
  const checks = [];
  if (targetKw == null || !panel || panel.watt == null || !inverter || inverter.kw == null) {
    checks.push(check(FINDING.TARGET_PANEL_CONFIG_UNRESOLVED, CHECK.UNRESOLVED,
      'Target capacity, panel wattage or inverter rating is unavailable; no panel configuration is proposed.',
      { missingInputs: [MISSING_INPUT.PANEL_ELECTRICAL_CHARACTERISTICS, MISSING_INPUT.INVERTER_ELECTRICAL_LIMITS] }));
    return Object.freeze({ proposedPanelCount: null, candidates: Object.freeze([]), checks: Object.freeze(checks) });
  }

  const exact = (Number(targetKw) * 1000) / Number(panel.watt);
  const base = Math.floor(exact);
  const counts = [];
  for (let n = Math.max(1, base - searchWidth); n <= base + searchWidth; n++) counts.push(n);

  const candidates = counts.map(n => {
    const r = assessDcAcRatio({ panel, panelCount: n, inverter, policy, manufacturerMaxDcAc, label: `${n}-panel configuration` });
    return Object.freeze({
      panelCount: n,
      dcWatt: n * Number(panel.watt),
      dcAcRatio: r.ratio,
      dcAcStatus: r.dcAcStatus,
      capacityDeviationKw: Math.round(((n * Number(panel.watt)) - Number(targetKw) * 1000) / 10) / 100,
      electricallyPermitted: r.dcAcStatus === DCAC_STATUS.VALID || r.dcAcStatus === DCAC_STATUS.WARNING,
    });
  });

  const permitted = candidates.filter(c => c.electricallyPermitted);
  if (!permitted.length) {
    checks.push(check(FINDING.TARGET_PANEL_CONFIG_UNRESOLVED, CHECK.UNRESOLVED,
      'No electrically permitted panel configuration was found for the target capacity. Capacity deviation alone ' +
      'is not a selection rule, so nothing is proposed and the configuration goes to Engineering.',
      { targetKw, candidates, missingInputs: [MISSING_INPUT.MANUFACTURER_DCAC_LIMIT] }));
    return Object.freeze({ proposedPanelCount: null, candidates: Object.freeze(candidates), checks: Object.freeze(checks) });
  }

  // Among ELECTRICALLY PERMITTED candidates only, prefer a VALID one, then the
  // smallest capacity deviation. Electrical validity is the gate; deviation only
  // ever orders candidates that have already passed it.
  const ordered = [...permitted].sort((a, b) => {
    const va = a.dcAcStatus === DCAC_STATUS.VALID ? 0 : 1;
    const vb = b.dcAcStatus === DCAC_STATUS.VALID ? 0 : 1;
    if (va !== vb) return va - vb;
    return Math.abs(a.capacityDeviationKw) - Math.abs(b.capacityDeviationKw);
  });
  const chosen = ordered[0];
  checks.push(check(FINDING.TARGET_PANEL_CONFIG_UNRESOLVED, CHECK.PASS,
    `${chosen.panelCount} × ${panel.watt} W is electrically permitted (DC/AC ${chosen.dcAcRatio}, ${chosen.dcAcStatus}) ` +
    `for a ${targetKw} kW target.`, { chosen }));

  return Object.freeze({
    proposedPanelCount: chosen.panelCount,
    proposed: chosen,
    candidates: Object.freeze(candidates),
    selectionRule: 'ELECTRICALLY_PERMITTED_FIRST_THEN_SMALLEST_CAPACITY_DEVIATION',
    checks: Object.freeze(checks),
  });
}

// ---------------------------------------------------------------------------
// C10 closure §8 — preliminary Sales-quotation items
// ---------------------------------------------------------------------------

/**
 * Preliminary allowance lines for a Sales upgrade quotation.
 *
 * ONLY the figures the decision states are given a number: 30 m of DC cable
 * (15 m positive + 15 m negative) and 3 MC4 pairs per NEW string. Every line is
 * marked ESTIMATED and adjustable by the Project Head after verification.
 *
 * The three-phase conversion items appear automatically for a >5 kW upgrade —
 * they must be visible on the quotation — but their QUANTITIES are not decided,
 * so each carries `quantity: null` and names its missing input. No AC-side
 * quantity is invented, and no cost or price is produced here.
 */
export function buildPreliminaryUpgradeItems({ fromKw = null, toKw = null, newStrings = 0, includeThreePhaseConversion = null } = {}) {
  const checks = [];
  const items = [];

  items.push(Object.freeze({
    role: 'DC_CABLE', quantity: PRELIMINARY_ALLOWANCE.DC_CABLE_TOTAL_M, unit: 'm',
    basis: ITEM_BASIS.PRELIMINARY_ALLOWANCE, estimated: true, adjustableByProjectHead: true,
    breakdown: Object.freeze({ positiveM: PRELIMINARY_ALLOWANCE.DC_CABLE_POSITIVE_M, negativeM: PRELIMINARY_ALLOWANCE.DC_CABLE_NEGATIVE_M }),
    note: 'Preliminary quotation allowance, not a final engineered quantity.',
  }));

  const mc4 = Number(newStrings) > 0 ? Number(newStrings) * PRELIMINARY_ALLOWANCE.MC4_PAIRS_PER_NEW_STRING : null;
  items.push(Object.freeze({
    role: 'MC4_CONNECTOR', quantity: mc4, unit: 'pair',
    basis: mc4 == null ? ITEM_BASIS.QUANTITY_NOT_DECIDED : ITEM_BASIS.PRELIMINARY_ALLOWANCE,
    estimated: true, adjustableByProjectHead: true,
    perNewString: PRELIMINARY_ALLOWANCE.MC4_PAIRS_PER_NEW_STRING,
    note: mc4 == null
      ? 'The number of new strings is not declared, so no MC4 allowance is produced.'
      : 'Preliminary allowance of 3 pairs per new string.',
  }));

  const threePhase = includeThreePhaseConversion ?? (toKw != null && Number(toKw) > SINGLE_PHASE_MAX_KW);
  if (threePhase) {
    for (const role of ['ACDB_3P', 'AC_PROTECTION_ISOLATOR', 'AC_CABLE', 'METER_KSEB_CONVERSION']) {
      items.push(Object.freeze({
        role, quantity: null, unit: null, basis: ITEM_BASIS.QUANTITY_NOT_DECIDED,
        estimated: true, adjustableByProjectHead: true, threePhaseConversion: true,
        note: 'Appears automatically on a three-phase conversion quotation. The quantity is not decided, so none ' +
          'is produced and it is not zero.',
      }));
    }
    checks.push(check(FINDING.AC_SIDE_QUANTITY_NOT_DECIDED, CHECK.UNRESOLVED,
      'Three-phase conversion items are listed for the preliminary quotation, but no approved quantity exists for them.',
      { missingInputs: [MISSING_INPUT.AC_SIDE_PRELIMINARY_QUANTITIES] }));
  }

  checks.push(check(FINDING.PRELIMINARY_ALLOWANCE_APPLIED, CHECK.PASS,
    'Preliminary Sales allowances applied. These are estimates for quotation only; the Project Head adjusts the ' +
    'BOM after site and configuration verification. Installation and service scope stay on the existing cost heads.',
    { pathKey: fromKw != null && toKw != null ? upgradePathKey(fromKw, toKw) : null }));

  return Object.freeze({
    preliminary: true, threePhaseConversion: !!threePhase,
    items: Object.freeze(items), checks: Object.freeze(checks),
    pricingNote: 'C10 produces no price and no rate. Costing stays with the Cost Engine and the existing cost heads.',
  });
}

// ---------------------------------------------------------------------------
// MPPT / string
// ---------------------------------------------------------------------------

/**
 * Can the additional panels take a free MPPT?
 *
 * `mpptUtilisation` is the DECLARED occupancy of the existing inverter's MPPTs.
 * V1 does not model string layout (checker PBC-D-002 / PBC-D-003 say so), so if
 * it is not declared this is UNRESOLVED, not "probably free".
 */
export function assessMpptAvailability({ inverter, mpptUtilisation = null, additionalStrings = 1 } = {}) {
  const checks = [];
  if (!inverter || inverter.mpptCount == null || inverter.maxStringsPerMppt == null) {
    checks.push(check(FINDING.INVERTER_LIMITS_UNKNOWN, CHECK.UNRESOLVED,
      'Inverter MPPT count / strings-per-MPPT are not available; MPPT availability cannot be evaluated.',
      { missingInputs: [MISSING_INPUT.INVERTER_ELECTRICAL_LIMITS] }));
    return Object.freeze({ freeMppts: null, checks: Object.freeze(checks) });
  }
  if (!Array.isArray(mpptUtilisation)) {
    checks.push(check(FINDING.MPPT_UTILISATION_UNKNOWN, CHECK.UNRESOLVED,
      'The existing MPPT/string layout is not declared. V1 does not model string configuration, ' +
      'so free MPPT capacity is not assumed.',
      { missingInputs: [MISSING_INPUT.MPPT_UTILISATION, MISSING_INPUT.EXISTING_STRING_LAYOUT] }));
    return Object.freeze({ freeMppts: null, checks: Object.freeze(checks) });
  }

  const used = mpptUtilisation.filter(m => (m?.stringsUsed ?? 0) > 0).length;
  const freeMppts = Number(inverter.mpptCount) - used;
  if (freeMppts >= additionalStrings) {
    checks.push(check(FINDING.MPPT_NONE_FREE, CHECK.PASS,
      `${freeMppts} of ${inverter.mpptCount} MPPT inputs are declared free; the additional array may use a separate MPPT.`,
      { freeMppts, additionalStrings }));
  } else {
    checks.push(check(FINDING.MPPT_NONE_FREE, CHECK.FAIL,
      `${additionalStrings} additional MPPT input(s) are required but only ${freeMppts} are declared free. ` +
      'No panel is added to an occupied string to make this fit.',
      { freeMppts, additionalStrings }));
  }
  return Object.freeze({ freeMppts, checks: Object.freeze(checks) });
}

/**
 * Adding panels to an EXISTING string.
 *
 * C10 §A.8–10 / §B.11: different panel wattages or models must never be combined
 * into one series string automatically. A different model or a different watt
 * therefore FAILS the same-string option outright and requires a separate
 * MPPT/string or an approved reconfiguration — the 550 W → 600 W case.
 */
export function assessPanelAddition({ existingPanel, newPanel, inverter, mpptUtilisation = null, additionalStrings = 1 } = {}) {
  const checks = [];
  if (!existingPanel || !newPanel) {
    checks.push(check(FINDING.MIXED_PANEL_SAME_STRING_FORBIDDEN, CHECK.UNRESOLVED,
      'Existing or proposed panel is not supplied; string compatibility cannot be evaluated.',
      { missingInputs: [MISSING_INPUT.EXISTING_PANEL] }));
    return Object.freeze({ sameStringPermitted: null, separateMpptRequired: null, checks: Object.freeze(checks) });
  }

  const sameModel = existingPanel.id === newPanel.id;
  const sameWatt = existingPanel.watt != null && newPanel.watt != null
    && Number(existingPanel.watt) === Number(newPanel.watt);

  let sameStringPermitted;
  if (!sameModel || !sameWatt) {
    sameStringPermitted = false;
    checks.push(check(FINDING.MIXED_PANEL_SAME_STRING_FORBIDDEN, CHECK.FAIL,
      `Existing panel ${existingPanel.id} (${existingPanel.watt} W) and proposed panel ${newPanel.id} ` +
      `(${newPanel.watt} W) are not the same model/wattage. They must NOT be combined into one series string. ` +
      'A separate MPPT/string, a replacement/reconfiguration or another approved configuration is required, ' +
      'and Sales may not resolve it.',
      { existingPanelId: existingPanel.id, newPanelId: newPanel.id,
        existingWatt: existingPanel.watt, newWatt: newPanel.watt }));
  } else {
    sameStringPermitted = null;
    checks.push(check(FINDING.STRING_LAYOUT_UNDECLARED, CHECK.UNRESOLVED,
      `Panels are the same model and wattage, but V1 does not model string length, so extending the existing ` +
      'string is not approved here. String voltage and current remain unverified.',
      { missingInputs: [MISSING_INPUT.EXISTING_STRING_LAYOUT] }));
  }

  const mppt = assessMpptAvailability({ inverter, mpptUtilisation, additionalStrings });
  checks.push(...mppt.checks);

  // Current headroom on the separate-MPPT route, only where both values exist.
  if (inverter && inverter.maxIsc != null && newPanel.isc != null) {
    const ok = Number(newPanel.isc) <= Number(inverter.maxIsc);
    checks.push(check(FINDING.MPPT_CURRENT_EXCEEDED, ok ? CHECK.PASS : CHECK.FAIL,
      `Proposed panel Isc ${newPanel.isc} A against inverter max input current ${inverter.maxIsc} A.`,
      { panelIsc: newPanel.isc, inverterMaxIsc: inverter.maxIsc }));
  } else {
    checks.push(check(FINDING.MPPT_CURRENT_EXCEEDED, CHECK.UNRESOLVED,
      'Panel Isc or inverter max input current is unavailable; current headroom cannot be verified.',
      { missingInputs: [MISSING_INPUT.INVERTER_ELECTRICAL_LIMITS, MISSING_INPUT.PANEL_ELECTRICAL_CHARACTERISTICS] }));
  }

  return Object.freeze({
    sameStringPermitted,
    separateMpptRequired: sameStringPermitted === false ? true : null,
    freeMppts: mppt.freeMppts,
    checks: Object.freeze(checks),
  });
}

// ---------------------------------------------------------------------------
// structure
// ---------------------------------------------------------------------------

/**
 * C10 §A.5 / §B.6 — existing structure is never automatically charged and never
 * automatically replaced. Three outcomes only, and the "additional required"
 * outcome carries NO quantity, because none is approved.
 */
export function assessStructure({ existingStructureAdequate = null } = {}) {
  if (existingStructureAdequate === true) {
    return Object.freeze({
      outcome: 'ALREADY_ADEQUATE', additionalStructureQuantity: null,
      checks: Object.freeze([check(FINDING.ADDITIONAL_STRUCTURE_REQUIRED, CHECK.PASS,
        'Existing structure is declared adequate. No additional structure is added and none is charged.')]),
    });
  }
  if (existingStructureAdequate === false) {
    return Object.freeze({
      outcome: 'ADDITIONAL_REQUIRED', additionalStructureQuantity: null,
      checks: Object.freeze([check(FINDING.ADDITIONAL_STRUCTURE_REQUIRED, CHECK.UNRESOLVED,
        'Additional structure is required. No approved quantity exists for this upgrade path, so none is produced ' +
        'and it is not zero.', { missingInputs: [MISSING_INPUT.ADDITIONAL_STRUCTURE_QUANTITY] })]),
    });
  }
  return Object.freeze({
    outcome: 'UNKNOWN', additionalStructureQuantity: null,
    checks: Object.freeze([check(FINDING.STRUCTURE_ADEQUACY_UNKNOWN, CHECK.UNRESOLVED,
      'Existing structure adequacy has not been assessed. It is neither assumed adequate nor assumed replaced.',
      { missingInputs: [MISSING_INPUT.EXISTING_STRUCTURE_ADEQUACY] })]),
  });
}

// ---------------------------------------------------------------------------
// inverter retention  (C10 §E — the safety rule)
// ---------------------------------------------------------------------------

/**
 * "A 6 kW inverter exists" does NOT mean "retain it".
 *
 * Retention is granted only when EVERY check passes. A single FAIL means
 * replacement is required; a single UNRESOLVED means the decision goes to
 * Engineering. `retain` is true only in the first case — never by default.
 */
export function assessInverterRetention({
  existingInverter = null, targetKw = null, requestedPhase = null,
  panel = null, panelCount = null, dcAcPolicy = null, manufacturerMaxDcAc = null,
  mpptUtilisation = null, additionalStrings = 1,
} = {}) {
  const checks = [];

  if (!existingInverter) {
    checks.push(check(FINDING.INVERTER_LIMITS_UNKNOWN, CHECK.UNRESOLVED,
      'No existing inverter supplied. Retention cannot be considered and replacement is not assumed either.',
      { missingInputs: [MISSING_INPUT.EXISTING_INVERTER] }));
    return finishRetention(checks, null);
  }

  // capacity
  if (existingInverter.kw == null) {
    checks.push(check(FINDING.INVERTER_CAPACITY_UNSUITABLE, CHECK.UNRESOLVED,
      'Existing inverter capacity is unknown.', { missingInputs: [MISSING_INPUT.INVERTER_ELECTRICAL_LIMITS] }));
  } else if (targetKw != null && Number(existingInverter.kw) < Number(targetKw)) {
    checks.push(check(FINDING.INVERTER_CAPACITY_UNSUITABLE, CHECK.FAIL,
      `Existing inverter is ${existingInverter.kw} kW against a ${targetKw} kW target. Replacement is required.`,
      { existingKw: existingInverter.kw, targetKw }));
  } else {
    checks.push(check(FINDING.INVERTER_CAPACITY_UNSUITABLE, CHECK.PASS,
      `Existing inverter capacity ${existingInverter.kw} kW covers the ${targetKw} kW target.`,
      { existingKw: existingInverter.kw, targetKw }));
  }

  // phase (C10 §C)
  const phase = assessPhaseRequirement({ targetKw, requestedPhase });
  if (phase.requiredPhase === PHASE.THREE) {
    if (!existingInverter.phase) {
      checks.push(check(FINDING.INVERTER_PHASE_UNSUITABLE, CHECK.UNRESOLVED,
        'Existing inverter phase is unknown; three-phase suitability cannot be verified.',
        { missingInputs: [MISSING_INPUT.INVERTER_ELECTRICAL_LIMITS] }));
    } else if (!String(existingInverter.phase).includes('3P')) {
      checks.push(check(FINDING.INVERTER_PHASE_UNSUITABLE, CHECK.FAIL,
        `Existing inverter is ${existingInverter.phase}; above ${SINGLE_PHASE_MAX_KW} kW the system is three-phase. Replacement is required.`,
        { existingPhase: existingInverter.phase, requiredPhase: PHASE.THREE }));
    } else {
      checks.push(check(FINDING.INVERTER_PHASE_UNSUITABLE, CHECK.PASS,
        `Existing inverter is ${existingInverter.phase}, matching the three-phase requirement.`,
        { existingPhase: existingInverter.phase }));
    }
  }
  checks.push(...phase.checks.filter(c => c.id !== FINDING.AC_SIDE_REEVALUATION_REQUIRED));

  // DC/AC ratio at the target configuration
  const dcac = assessDcAcRatio({ panel, panelCount, inverter: existingInverter, policy: dcAcPolicy, manufacturerMaxDcAc, label: 'target configuration' });
  checks.push(dcac.check);

  // MPPT headroom for the additional array
  const mppt = assessMpptAvailability({ inverter: existingInverter, mpptUtilisation, additionalStrings });
  checks.push(...mppt.checks);

  return finishRetention(checks, dcac.ratio);
}

function finishRetention(checks, ratio) {
  const failed = checks.filter(c => c.status === CHECK.FAIL);
  const unresolved = checks.filter(c => c.status === CHECK.UNRESOLVED);
  const retain = failed.length ? false : (unresolved.length ? null : true);
  const verdict = retain === true ? FINDING.INVERTER_RETAINED
    : retain === false ? FINDING.INVERTER_REPLACEMENT_REQUIRED
      : FINDING.SALES_MAY_NOT_ENGINEER;
  return Object.freeze({
    retain,
    replacementRequired: retain === false ? true : (retain === true ? false : null),
    verdict,
    dcAcRatio: ratio,
    failedChecks: Object.freeze(failed.map(c => c.id)),
    warningChecks: Object.freeze(checks.filter(c => c.status === CHECK.WARNING).map(c => c.id)),
    missingInputs: unresolvedInputs(checks),
    checks: Object.freeze(checks),
  });
}

// ---------------------------------------------------------------------------
// approved fixed items for an upgrade path
// ---------------------------------------------------------------------------

/** `3` + `6` -> `"3_6"`. Key form only — it decides nothing. */
export function upgradePathKey(fromKw, toKw) { return `${Number(fromKw)}_${Number(toKw)}`; }

/**
 * Fixed items for an upgrade path, taken from the catalog EXACTLY as authored.
 *
 * A path with no `qty` entry (today: `3_6` and `3_8`) resolves to
 * `resolved: false` with the key named. It is never satisfied by the nearest
 * path, never scaled by panel count and never defaulted to zero.
 */
export function resolveUpgradeFixedItems(catalog, fromKw, toKw) {
  const key = upgradePathKey(fromKw, toKw);
  const all = catalog?.bomTemplates?.upgrade?.fixedItems || [];
  const definedKeys = [...new Set(all.flatMap(i => Object.keys(i.qty || {})))].sort();
  const items = all
    .filter(i => i.qty && Object.prototype.hasOwnProperty.call(i.qty, key))
    .map(i => Object.freeze({ itemId: i.itemId, name: i.name, category: i.category, quantity: i.qty[key], source: 'CATALOG_UPGRADE_FIXED_ITEMS' }));

  if (!items.length) {
    return Object.freeze({
      pathKey: key, resolved: false, items: Object.freeze([]),
      definedPathKeys: Object.freeze(definedKeys),
      check: check(FINDING.FIXED_ITEMS_NOT_DEFINED, CHECK.UNRESOLVED,
        `No approved fixed-item quantities exist for upgrade path "${key}". Defined paths: ${definedKeys.join(', ') || 'none'}. ` +
        'Quantities are never derived from another path and are not zero.',
        { pathKey: key, definedPathKeys: definedKeys, missingInputs: [MISSING_INPUT.UPGRADE_FIXED_ITEM_QUANTITIES] }),
    });
  }
  return Object.freeze({
    pathKey: key, resolved: true, items: Object.freeze(items),
    definedPathKeys: Object.freeze(definedKeys),
    check: check(FINDING.FIXED_ITEMS_NOT_DEFINED, CHECK.PASS,
      `Approved fixed-item quantities exist for upgrade path "${key}".`, { pathKey: key }),
  });
}

// ---------------------------------------------------------------------------
// the assessment
// ---------------------------------------------------------------------------

/**
 * Assess an upgrade end to end.
 *
 * FUTURE_READY additionally assesses the INITIAL configuration's DC/AC ratio, so
 * both the initial system and the intended future system must satisfy it.
 * EXISTING_SYSTEM inspects the existing inverter FIRST (C10 §B.1).
 */
export function assessUpgrade({
  scenario, fromKw, toKw, tier = null, requestedPhase = null,
  existingInverter = null, existingPanel = null,
  initialPanel = null, initialPanelCount = null,
  targetPanel = null, targetPanelCount = null,
  existingStructureAdequate = null, mpptUtilisation = null,
  additionalStrings = 1, dcAcPolicy = null, catalog = null, sections = null,
  // ---- C10 closure additions -------------------------------------------
  existingPanelCount = null, panelHealthScreening = null, constraintForcesReplacement = false,
  targetInverter = null, manufacturerMaxDcAc = null, newStrings = 0, preliminary = true,
} = {}) {
  if (!Object.values(SCENARIO).includes(scenario))
    throw new Error(`Unknown upgrade scenario "${scenario}". FUTURE_READY and EXISTING_SYSTEM are never conflated.`);

  const identity = buildUpgradeIdentity({ fromKw, toKw, tier, sections });
  const checks = [];

  if (!identity.approved) {
    checks.push(check(FINDING.UPGRADE_PATH_NOT_APPROVED, CHECK.FAIL,
      `Upgrade path ${fromKw} → ${toKw} kW is not in the approved list (C10). It is blocked, not extrapolated.`,
      { approvedPaths: APPROVED_UPGRADE_PATHS.map(p => `${p.fromKw}_${p.toKw}`) }));
  } else {
    checks.push(check(FINDING.UPGRADE_PATH_NOT_APPROVED, CHECK.PASS,
      `Upgrade path ${identity.upgradePathId} is engineering-approved.`, { upgradePathId: identity.upgradePathId }));
  }

  const phase = assessPhaseRequirement({ targetKw: toKw, requestedPhase });
  checks.push(...phase.checks);

  // FUTURE_READY: the INITIAL system must satisfy the ratio too (C10 §A.1)
  let initialDcAc = null;
  if (scenario === SCENARIO.FUTURE_READY) {
    initialDcAc = assessDcAcRatio({
      panel: initialPanel ?? existingPanel, panelCount: initialPanelCount,
      inverter: existingInverter, policy: dcAcPolicy, label: 'initial system',
    });
    checks.push(initialDcAc.check);
  }

  const inverter = assessInverterRetention({
    existingInverter, targetKw: toKw, requestedPhase,
    panel: targetPanel ?? existingPanel, panelCount: targetPanelCount,
    dcAcPolicy, manufacturerMaxDcAc, mpptUtilisation, additionalStrings,
  });
  checks.push(...inverter.checks);

  // C10 closure §5 — target panel configuration, judged electrically
  const targetConfiguration = proposeTargetPanelConfiguration({
    targetKw: toKw, panel: targetPanel ?? existingPanel,
    inverter: inverter.retain === true ? existingInverter : targetInverter,
    manufacturerMaxDcAc, policy: dcAcPolicy,
  });
  checks.push(...targetConfiguration.checks);

  // C10 closure §3 — existing panels
  const existingPanels = assessExistingPanels({
    existingPanel, existingPanelCount,
    healthScreening: panelHealthScreening, constraintForcesReplacement,
  });
  checks.push(...existingPanels.checks);

  const panels = (existingPanel && targetPanel)
    ? assessPanelAddition({ existingPanel, newPanel: targetPanel, inverter: existingInverter, mpptUtilisation, additionalStrings })
    : null;
  if (panels) checks.push(...panels.checks);

  const structure = assessStructure({ existingStructureAdequate });
  checks.push(...structure.checks);

  const fixedItems = catalog ? resolveUpgradeFixedItems(catalog, fromKw, toKw) : null;
  if (fixedItems) checks.push(fixedItems.check);

  // C10 closure §2 — a replaced inverter needs its approved target, and the old
  // unit is never expressed as a negative quantity.
  if (inverter.replacementRequired === true && !targetInverter) {
    checks.push(check(FINDING.TARGET_INVERTER_NOT_SUPPLIED, CHECK.UNRESOLVED,
      'The existing inverter must be replaced, but no approved target inverter was supplied. None is chosen here.',
      { missingInputs: [MISSING_INPUT.APPROVED_TARGET_INVERTER] }));
  }

  // C10 closure §8 — preliminary Sales allowances
  const preliminaryItems = preliminary
    ? buildPreliminaryUpgradeItems({ fromKw, toKw, newStrings, includeThreePhaseConversion: phase.requiredPhase === PHASE.THREE })
    : null;
  if (preliminaryItems) checks.push(...preliminaryItems.checks);

  // C10 closure §9 — every affected component resolves to one disposition
  const dispositions = buildDispositions({
    inverter, targetInverter, existingInverter, existingPanels,
    targetConfiguration, targetPanel: targetPanel ?? existingPanel, structure,
    preliminaryItems,
  });

  const failed = checks.filter(c => c.status === CHECK.FAIL);
  const unresolved = checks.filter(c => c.status === CHECK.UNRESOLVED);
  const status = failed.length ? ASSESSMENT_STATUS.BLOCKED
    : unresolved.length ? ASSESSMENT_STATUS.ENGINEERING_REQUEST_REQUIRED
      : ASSESSMENT_STATUS.RESOLVED;

  return Object.freeze({
    assessmentVersion: UPGRADE_ASSESSMENT_VERSION,
    scenario, identity: Object.freeze(identity), status,
    requiredPhase: phase.requiredPhase,
    acSideReevaluation: phase.acSideReevaluation,
    initialDcAcRatio: initialDcAc ? initialDcAc.ratio : null,
    targetDcAcRatio: inverter.dcAcRatio,
    inverter, panels, structure, fixedItems,
    existingPanels, targetConfiguration, preliminaryItems, dispositions,
    proposedTargetPanelCount: targetConfiguration.proposedPanelCount,
    failedChecks: Object.freeze(failed.map(c => c.id)),
    warningChecks: Object.freeze(checks.filter(c => c.status === CHECK.WARNING).map(c => c.id)),
    missingInputs: unresolvedInputs(checks),
    routeToEngineering: status !== ASSESSMENT_STATUS.RESOLVED,
    salesNote: 'Sales does not resolve MPPT/string configurations. An unresolved or blocked assessment goes to ' +
      'Project Head / Engineering as an upgrade configuration request (C10 §D).',
    checks: Object.freeze(checks),
    quantitiesProduced: Object.freeze(fixedItems?.resolved ? fixedItems.items : []),
  });
}

/**
 * C10 closure §9 — RETAIN / REPLACE / ADD / ENGINEERING_REVIEW for every
 * affected component, wherever the available data permits. A quantity appears
 * only where an approved or explicitly stated figure exists; anything else stays
 * null and named. No negative quantity is ever produced.
 */
function buildDispositions({ inverter, targetInverter, existingInverter, existingPanels, targetConfiguration, targetPanel, structure, preliminaryItems }) {
  const out = [];

  // inverter
  if (inverter.retain === true) {
    out.push({ role: 'INVERTER', disposition: DISPOSITION.RETAIN,
      componentId: existingInverter?.id ?? null, quantity: null,
      note: 'Existing inverter passes every required check and is retained.' });
  } else if (inverter.replacementRequired === true) {
    out.push({ role: 'INVERTER', disposition: DISPOSITION.REPLACE,
      componentId: existingInverter?.id ?? null, quantity: null,
      removedUnitOwnedByCustomer: true, pricingImpact: 'NONE',
      note: 'Existing inverter fails a required check. The removed unit is never a negative quantity.' });
    out.push({ role: 'INVERTER', disposition: targetInverter ? DISPOSITION.ADD : DISPOSITION.ENGINEERING_REVIEW,
      componentId: targetInverter?.id ?? null,
      quantity: targetInverter ? 1 : null,
      basis: targetInverter ? ITEM_BASIS.CATALOG_APPROVED : ITEM_BASIS.QUANTITY_NOT_DECIDED,
      note: targetInverter
        ? 'Approved target inverter supplied by the caller; one unit.'
        : 'No approved target inverter supplied — Engineering must name it. None is chosen here.' });
  } else {
    out.push({ role: 'INVERTER', disposition: DISPOSITION.ENGINEERING_REVIEW,
      componentId: existingInverter?.id ?? null, quantity: null,
      note: 'Inverter suitability is unresolved. Retention is not assumed and replacement is not assumed.' });
  }

  // existing panels
  out.push({ role: 'PANEL', disposition: existingPanels.disposition,
    componentId: existingPanels.componentId, quantity: existingPanels.quantity,
    pricingImpact: existingPanels.pricingImpact,
    removedPanelsOwnedByCustomer: existingPanels.removedPanelsOwnedByCustomer,
    note: existingPanels.note });

  // additional panels
  out.push({ role: 'PANEL', disposition: targetConfiguration.proposedPanelCount != null ? DISPOSITION.ADD : DISPOSITION.ENGINEERING_REVIEW,
    componentId: targetPanel?.id ?? null,
    quantity: targetConfiguration.proposedPanelCount,
    basis: targetConfiguration.proposedPanelCount != null ? 'ELECTRICALLY_PERMITTED_CONFIGURATION' : ITEM_BASIS.QUANTITY_NOT_DECIDED,
    note: targetConfiguration.proposedPanelCount != null
      ? 'Target panel configuration is electrically permitted against the manufacturer specification.'
      : 'No electrically permitted panel configuration; Engineering must resolve it.' });

  // structure
  out.push({ role: 'STRUCTURE',
    disposition: structure.outcome === 'ALREADY_ADEQUATE' ? DISPOSITION.RETAIN
      : structure.outcome === 'ADDITIONAL_REQUIRED' ? DISPOSITION.ADD : DISPOSITION.ENGINEERING_REVIEW,
    componentId: null, quantity: structure.additionalStructureQuantity,
    basis: structure.outcome === 'ADDITIONAL_REQUIRED' ? ITEM_BASIS.QUANTITY_NOT_DECIDED : null,
    note: structure.outcome === 'ADDITIONAL_REQUIRED'
      ? 'Additional structure is required; no approved quantity exists, so none is produced.'
      : structure.outcome === 'ALREADY_ADEQUATE' ? 'Existing structure is adequate and is retained.'
        : 'Structure adequacy is unknown; it goes to Engineering.' });

  // preliminary allowance lines
  for (const it of preliminaryItems?.items || []) {
    out.push({ role: it.role, disposition: it.quantity == null ? DISPOSITION.ENGINEERING_REVIEW : DISPOSITION.ADD,
      componentId: null, quantity: it.quantity, unit: it.unit ?? null,
      basis: it.basis, estimated: true, adjustableByProjectHead: true, note: it.note });
  }

  for (const d of out) {
    if (d.quantity != null && Number(d.quantity) < 0)
      throw new Error(`A negative quantity was produced for ${d.role}. C10 forbids it.`);
  }
  return Object.freeze(out.map(Object.freeze));
}

// ---------------------------------------------------------------------------
// C10 §D — the request / approval path
// ---------------------------------------------------------------------------

export const REQUEST_STATUS = {
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
};

export const REQUEST_ERROR = {
  REQUEST_EXISTS: 'REQUEST_EXISTS',
  REQUEST_NOT_FOUND: 'REQUEST_NOT_FOUND',
  REQUEST_ALREADY_DECIDED: 'REQUEST_ALREADY_DECIDED',
  MISSING_TIMESTAMP: 'MISSING_TIMESTAMP',
  MISSING_IDENTIFIER: 'MISSING_IDENTIFIER',
  NOT_A_REVIEWER: 'NOT_A_REVIEWER',
  CONFIGURATION_INCOMPLETE: 'CONFIGURATION_INCOMPLETE',
};

export class UpgradeRequestError extends Error {
  constructor(code, message, detail = null) {
    super(message); this.name = 'UpgradeRequestError'; this.code = code; this.detail = detail;
  }
}

export function createUpgradeRequestStore() {
  return { requests: new Map(), storeVersion: UPGRADE_ASSESSMENT_VERSION };
}

/**
 * Reviewers are Project Head or Engineering, expressed through capabilities that
 * already exist. No new role and no new capability is introduced.
 */
export function isUpgradeReviewer(actorRole) {
  return can(actorRole, CAPABILITY.ENGINEERING_APPROVE) || can(actorRole, CAPABILITY.BOM_LOCK);
}

/**
 * SALES submits the existing-system information and the assessment. Submitting
 * a request is not an authorisation to change anything, so it needs only
 * BOM_VIEW — which Sales already holds. Sales never authors the configuration.
 */
export function submitUpgradeRequest(store, actor, { requestId, projectId = null, assessment, existingSystem = null, at } = {}) {
  assertCan(actor, CAPABILITY.BOM_VIEW);
  if (!requestId) throw new UpgradeRequestError(REQUEST_ERROR.MISSING_IDENTIFIER, 'requestId is required.');
  if (!at) throw new UpgradeRequestError(REQUEST_ERROR.MISSING_TIMESTAMP, 'A caller-supplied `at` is required. This layer has no clock.');
  if (!assessment) throw new UpgradeRequestError(REQUEST_ERROR.CONFIGURATION_INCOMPLETE, 'An assessment is required.');
  if (store.requests.has(requestId))
    throw new UpgradeRequestError(REQUEST_ERROR.REQUEST_EXISTS, `Upgrade request ${requestId} already exists.`, { requestId });

  const record = Object.freeze({
    requestId, projectId,
    status: REQUEST_STATUS.SUBMITTED,
    scenario: assessment.scenario,
    upgradePathId: assessment.identity?.upgradePathId ?? null,
    assessment,
    existingSystem,
    submittedBy: actor.userId, submittedByRole: actor.role, submittedAt: at,
    reviewedBy: null, reviewedAt: null, decisionReason: null,
    approvedConfiguration: null,
  });
  store.requests.set(requestId, record);
  return record;
}

export function getUpgradeRequest(store, actor, requestId) {
  assertCan(actor, CAPABILITY.BOM_VIEW);
  const r = store.requests.get(requestId);
  if (!r) throw new UpgradeRequestError(REQUEST_ERROR.REQUEST_NOT_FOUND, `Upgrade request ${requestId} not found.`, { requestId });
  return r;
}

export function listUpgradeRequests(store, actor) {
  assertCan(actor, CAPABILITY.BOM_VIEW);
  return [...store.requests.values()].map(r => ({
    requestId: r.requestId, status: r.status, scenario: r.scenario,
    upgradePathId: r.upgradePathId, submittedBy: r.submittedBy, submittedAt: r.submittedAt,
  }));
}

function assertReviewer(actor) {
  assertCan(actor, CAPABILITY.BOM_VIEW);
  if (!isUpgradeReviewer(actor.role))
    throw new UpgradeRequestError(REQUEST_ERROR.NOT_A_REVIEWER,
      `Role ${actor.role} may not decide an upgrade configuration request. Project Head or Engineering only (C10 §D).`,
      { actorRole: actor.role });
}

/**
 * The reviewer's configuration becomes AUTHORITATIVE for costing and quotation.
 * Every line must carry an explicit quantity supplied by the reviewer — this
 * function derives none, scales none and defaults none.
 */
export function approveUpgradeRequest(store, actor, requestId, { configuration, at, reason = null } = {}) {
  assertReviewer(actor);
  const r = getUpgradeRequest(store, actor, requestId);
  if (!at) throw new UpgradeRequestError(REQUEST_ERROR.MISSING_TIMESTAMP, 'A caller-supplied `at` is required.');
  if (r.status !== REQUEST_STATUS.SUBMITTED)
    throw new UpgradeRequestError(REQUEST_ERROR.REQUEST_ALREADY_DECIDED,
      `Upgrade request ${requestId} is already ${r.status}.`, { requestId, status: r.status });
  if (!configuration || !Array.isArray(configuration.lines) || !configuration.lines.length)
    throw new UpgradeRequestError(REQUEST_ERROR.CONFIGURATION_INCOMPLETE,
      'An approved configuration must list the BOM lines explicitly. Nothing is derived here.', { requestId });

  const bad = configuration.lines.filter(l => !l || !l.componentId || l.quantity == null);
  if (bad.length)
    throw new UpgradeRequestError(REQUEST_ERROR.CONFIGURATION_INCOMPLETE,
      'Every approved line needs a componentId and an explicit quantity. A missing quantity is never treated as zero.',
      { requestId, offendingLines: bad });

  const approved = Object.freeze({
    ...r,
    status: REQUEST_STATUS.APPROVED,
    reviewedBy: actor.userId, reviewedByRole: actor.role, reviewedAt: at, decisionReason: reason,
    approvedConfiguration: deepFreeze({
      ...configuration,
      authoritative: true,
      authoritativeFor: ['PROJECT_BOM', 'COST', 'QUOTATION'],
      approvedBy: actor.userId, approvedByRole: actor.role, approvedAt: at,
      upgradePathId: r.upgradePathId, scenario: r.scenario,
      source: 'PROJECT_HEAD_OR_ENGINEERING_APPROVAL',
    }),
  });
  store.requests.set(requestId, approved);
  return approved;
}

export function rejectUpgradeRequest(store, actor, requestId, { at, reason = null } = {}) {
  assertReviewer(actor);
  const r = getUpgradeRequest(store, actor, requestId);
  if (!at) throw new UpgradeRequestError(REQUEST_ERROR.MISSING_TIMESTAMP, 'A caller-supplied `at` is required.');
  if (r.status !== REQUEST_STATUS.SUBMITTED)
    throw new UpgradeRequestError(REQUEST_ERROR.REQUEST_ALREADY_DECIDED,
      `Upgrade request ${requestId} is already ${r.status}.`, { requestId, status: r.status });
  const rejected = Object.freeze({
    ...r, status: REQUEST_STATUS.REJECTED,
    reviewedBy: actor.userId, reviewedByRole: actor.role, reviewedAt: at, decisionReason: reason,
    approvedConfiguration: null,
  });
  store.requests.set(requestId, rejected);
  return rejected;
}

/** The authoritative configuration, or null. Never a fallback, never a guess. */
export function authoritativeConfigurationFor(store, actor, requestId) {
  const r = getUpgradeRequest(store, actor, requestId);
  return r.status === REQUEST_STATUS.APPROVED ? r.approvedConfiguration : null;
}

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}
