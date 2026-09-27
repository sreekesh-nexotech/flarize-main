/**
 * UPGRADE REVIEW WORKSPACE — PROJECT HEAD APPLICATION LAYER.  (Decision C10)
 *
 * The review surface between Sales and the Project Head:
 *
 *   SALES submits an upgrade request
 *     -> the C10 assessment produces a PRELIMINARY configuration
 *     -> PROJECT HEAD / ENGINEERING reviews the engineering calculation and BOM
 *     -> Project Head adjusts the quantities C10 left unresolved or preliminary
 *     -> Project Head approves
 *     -> the approved configuration is AUTHORITATIVE for PROJECT_BOM, COST, QUOTATION
 *
 * NO SECOND ENGINEERING ENGINE.
 *   Every verdict, ratio, disposition and allowance shown by `reviewPanel` comes
 *   from `upgradeAssessment.js`. This layer computes no ratio, decides no
 *   disposition, sizes no string and picks no component. It arranges what the
 *   assessment produced, records what the Project Head decided, and freezes the
 *   result. Its import list is `['./rbac.js', './upgradeAssessment.js']`.
 *
 * WHAT IT REFUSES
 *   - to fabricate a quantity C10 left unresolved (only the Project Head may
 *     supply one, and it is recorded with actor, timestamp and reason)
 *   - to approve while a component still sits in ENGINEERING_REVIEW without an
 *     explicit decision
 *   - to let a removed customer-owned item carry a price or a negative quantity
 *   - to invent a manufacturer limit, a structure quantity or an AC-side quantity
 *   - to let a quotation recalculate the engineering configuration: the approved
 *     configuration is frozen and marked `recalculationForbidden`
 *
 * DETERMINISM: no clock, no randomness. Every `at` is caller-supplied, exactly
 * as `projectWorkspace.js` does it.
 */

import {
  assessUpgrade, SCENARIO, DISPOSITION, DCAC_STATUS, CHECK, ASSESSMENT_STATUS,
  PRELIMINARY_ALLOWANCE, ITEM_BASIS, PANEL_HEALTH, PANEL_RETENTION_MIN_WATT,
  SINGLE_PHASE_MAX_KW, AC_SIDE_REEVALUATION_ITEMS, MISSING_INPUT, FINDING,
  createUpgradeRequestStore, submitUpgradeRequest as submitToStore,
  getUpgradeRequest, listUpgradeRequests, approveUpgradeRequest, rejectUpgradeRequest,
  authoritativeConfigurationFor, isUpgradeReviewer, REQUEST_STATUS, REQUEST_ERROR,
  UpgradeRequestError,
} from './upgradeAssessment.js';
import { assertCan, CAPABILITY } from './rbac.js';

export const UPGRADE_REVIEW_VERSION = 'upgradeReview.1';

export const REVIEW_ERROR = {
  NOT_A_REVIEWER: REQUEST_ERROR.NOT_A_REVIEWER,
  REQUEST_NOT_FOUND: REQUEST_ERROR.REQUEST_NOT_FOUND,
  MISSING_TIMESTAMP: REQUEST_ERROR.MISSING_TIMESTAMP,
  MISSING_IDENTIFIER: REQUEST_ERROR.MISSING_IDENTIFIER,
  ADJUSTMENT_NOT_PERMITTED: 'ADJUSTMENT_NOT_PERMITTED',
  ADJUSTMENT_INVALID: 'ADJUSTMENT_INVALID',
  UNRESOLVED_ITEMS_REMAIN: 'UNRESOLVED_ITEMS_REMAIN',
  ALREADY_DECIDED: REQUEST_ERROR.REQUEST_ALREADY_DECIDED,
};

export class UpgradeReviewError extends Error {
  constructor(code, message, detail = null) {
    super(message); this.name = 'UpgradeReviewError'; this.code = code; this.detail = detail;
  }
}

/** One store; the request records are the C10 module's own. */
export function createUpgradeReviewStore() {
  const store = createUpgradeRequestStore();
  store.reviewVersion = UPGRADE_REVIEW_VERSION;
  store.adjustments = new Map();       // requestId -> [{ role, componentId, quantity, ... }]
  store.remarks = new Map();           // requestId -> [{ remark, by, at }]
  return store;
}

const needAt = (at) => {
  if (!at) throw new UpgradeReviewError(REVIEW_ERROR.MISSING_TIMESTAMP,
    'Every review operation requires a caller-supplied `at`. This layer has no clock.');
  return at;
};

function assertReviewer(actor) {
  assertCan(actor, CAPABILITY.BOM_VIEW);
  if (!isUpgradeReviewer(actor.role))
    throw new UpgradeReviewError(REVIEW_ERROR.NOT_A_REVIEWER,
      `Role ${actor.role} may not review or approve an upgrade configuration. Project Head or Engineering only (C10 §D).`,
      { actorRole: actor.role });
  return true;
}

// ---------------------------------------------------------------------------
// 1. Sales submits
// ---------------------------------------------------------------------------

/**
 * Sales submits the existing-system information and the requested target.
 * The C10 assessment runs here — Sales never authors the configuration and
 * never resolves an MPPT/string question.
 */
export function submitUpgradeReview(store, {
  actor, requestId, projectId = null, at,
  scenario, fromKw, toKw, tier = null, requestedPhase = null,
  existingInverter = null, existingPanel = null, existingPanelCount = null,
  panelHealthScreening = null, constraintForcesReplacement = false,
  initialPanel = null, initialPanelCount = null,
  targetPanel = null, targetPanelCount = null, targetInverter = null,
  existingStructureAdequate = null, mpptUtilisation = null, additionalStrings = 1,
  newStrings = 0, dcAcPolicy = null, manufacturerMaxDcAc = null, catalog = null,
  customerReference = null,
}) {
  assertCan(actor, CAPABILITY.BOM_VIEW);
  needAt(at);

  const assessment = assessUpgrade({
    scenario, fromKw, toKw, tier, requestedPhase,
    existingInverter, existingPanel, existingPanelCount, panelHealthScreening,
    constraintForcesReplacement, initialPanel, initialPanelCount,
    targetPanel, targetPanelCount, targetInverter,
    existingStructureAdequate, mpptUtilisation, additionalStrings,
    newStrings, dcAcPolicy, manufacturerMaxDcAc, catalog,
  });

  const record = submitToStore(store, actor, {
    requestId, projectId, assessment, at,
    existingSystem: {
      customerReference,
      inverterId: existingInverter?.id ?? null,
      inverterKw: existingInverter?.kw ?? null,
      inverterPhase: existingInverter?.phase ?? null,
      panelId: existingPanel?.id ?? null,
      panelWatt: existingPanel?.watt ?? null,
      panelCount: existingPanelCount,
      panelHealthScreening,
      structureAdequate: existingStructureAdequate,
      mpptUtilisation,
    },
  });
  store.adjustments.set(requestId, []);
  store.remarks.set(requestId, []);
  return record;
}

// ---------------------------------------------------------------------------
// 2. the review panel
// ---------------------------------------------------------------------------

const dispositionsOf = (a, role) => (a.dispositions || []).filter(d => d.role === role);

/**
 * Everything the Project Head must see before deciding. Presentation shaping
 * only: every value below is copied from the assessment.
 */
export function reviewPanel(store, { actor, requestId }) {
  assertCan(actor, CAPABILITY.BOM_VIEW);
  const r = getUpgradeRequest(store, actor, requestId);
  const a = r.assessment;
  const adjustments = store.adjustments.get(requestId) || [];
  const byKey = new Map(adjustments.map(x => [adjustmentKey(x), x]));

  const inverterLines = dispositionsOf(a, 'INVERTER');
  const panelLines = dispositionsOf(a, 'PANEL');
  const structureLine = dispositionsOf(a, 'STRUCTURE')[0] ?? null;
  const preliminaryLines = (a.dispositions || []).filter(d =>
    d.basis === ITEM_BASIS.PRELIMINARY_ALLOWANCE || d.estimated === true);

  const unresolved = (a.dispositions || [])
    .filter(needsDecision)
    .map(d => Object.freeze({
      role: d.role, componentId: d.componentId ?? null,
      disposition: d.disposition, quantity: d.quantity ?? null,
      adjusted: byKey.has(adjustmentKey(d)),
      adjustedQuantity: byKey.get(adjustmentKey(d))?.quantity ?? null,
      note: d.note ?? null,
    }));

  return deepFreeze({
    reviewVersion: UPGRADE_REVIEW_VERSION,
    requestId: r.requestId,
    projectId: r.projectId,
    requestStatus: r.status,
    submittedBy: r.submittedBy, submittedByRole: r.submittedByRole, submittedAt: r.submittedAt,
    assessmentStatus: a.status,
    routeToEngineering: a.routeToEngineering,

    // ---- existing vs requested -------------------------------------------
    existingSystem: r.existingSystem,
    requestedTarget: {
      scenario: a.scenario,
      upgradePathId: a.identity?.upgradePathId ?? null,
      approvedPath: a.identity?.approved ?? null,
      fromKw: a.identity?.fromSize ?? null,
      toKw: a.identity?.toSize ?? null,
      deltaKw: a.identity?.deltaKw ?? null,
      tier: a.identity?.tier ?? null,
    },

    // ---- inverter ---------------------------------------------------------
    inverter: {
      existingComponentId: r.existingSystem?.inverterId ?? null,
      existingKw: r.existingSystem?.inverterKw ?? null,
      existingPhase: r.existingSystem?.inverterPhase ?? null,
      retain: a.inverter?.retain ?? null,
      replacementRequired: a.inverter?.replacementRequired ?? null,
      verdict: a.inverter?.verdict ?? null,
      disposition: inverterLines[0]?.disposition ?? DISPOSITION.ENGINEERING_REVIEW,
      proposedComponentId: inverterLines[1]?.componentId ?? null,
      proposedQuantity: inverterLines[1]?.quantity ?? null,
      proposedDisposition: inverterLines[1]?.disposition ?? null,
      removedUnitOwnedByCustomer: inverterLines[0]?.removedUnitOwnedByCustomer ?? null,
      pricingImpactOfRemoval: inverterLines[0]?.pricingImpact ?? null,
      checks: a.inverter?.checks ?? [],
    },

    // ---- panels -----------------------------------------------------------
    panels: {
      existingComponentId: a.existingPanels?.componentId ?? null,
      existingQuantity: a.existingPanels?.quantity ?? null,
      existingDisposition: a.existingPanels?.disposition ?? null,
      healthScreening: r.existingSystem?.panelHealthScreening ?? null,
      healthScreeningSource: 'SALES_SCREENING',
      retentionBoundaryWatt: PANEL_RETENTION_MIN_WATT,
      removedPanelsOwnedByCustomer: a.existingPanels?.removedPanelsOwnedByCustomer ?? null,
      pricingImpactOfRemoval: a.existingPanels?.pricingImpact ?? null,
      buybackValue: a.existingPanels?.buybackValue ?? null,
      tradeInValue: a.existingPanels?.tradeInValue ?? null,
      additionalDisposition: panelLines[1]?.disposition ?? null,
      additionalComponentId: panelLines[1]?.componentId ?? null,
      additionalQuantity: panelLines[1]?.quantity ?? null,
      checks: a.existingPanels?.checks ?? [],
    },

    // ---- target configuration + electrical -------------------------------
    targetConfiguration: {
      proposedPanelCount: a.targetConfiguration?.proposedPanelCount ?? null,
      selectionRule: a.targetConfiguration?.selectionRule ?? null,
      candidates: a.targetConfiguration?.candidates ?? [],
      dcCapacityWatt: a.targetConfiguration?.proposed?.dcWatt ?? null,
      acInverterCapacityKw: a.inverter?.retain === true
        ? (r.existingSystem?.inverterKw ?? null)
        : (inverterLines[1]?.componentId ? null : null),
      dcAcRatio: a.targetDcAcRatio ?? null,
      dcAcStatus: a.targetConfiguration?.proposed?.dcAcStatus ?? dcAcStatusFromChecks(a),
      initialDcAcRatio: a.initialDcAcRatio ?? null,
    },

    // ---- MPPT / string ----------------------------------------------------
    mpptStringReview: {
      declaredUtilisation: r.existingSystem?.mpptUtilisation ?? null,
      freeMppts: a.panels?.freeMppts ?? null,
      sameStringPermitted: a.panels?.sameStringPermitted ?? null,
      separateMpptRequired: a.panels?.separateMpptRequired ?? null,
      checks: a.panels?.checks ?? [],
    },

    // ---- phase ------------------------------------------------------------
    phaseRequirement: {
      requiredPhase: a.requiredPhase ?? null,
      singlePhaseMaxKw: SINGLE_PHASE_MAX_KW,
      acSideReevaluation: a.acSideReevaluation ?? null,
      acSideItems: AC_SIDE_REEVALUATION_ITEMS,
    },

    // ---- structure --------------------------------------------------------
    structure: {
      outcome: a.structure?.outcome ?? null,
      disposition: structureLine?.disposition ?? DISPOSITION.ENGINEERING_REVIEW,
      quantity: structureLine?.quantity ?? null,
      adjustedQuantity: byKey.get('STRUCTURE|')?.quantity ?? null,
      checks: a.structure?.checks ?? [],
    },

    // ---- preliminary allowances ------------------------------------------
    preliminaryAllowances: {
      dcCable: {
        totalM: PRELIMINARY_ALLOWANCE.DC_CABLE_TOTAL_M,
        positiveM: PRELIMINARY_ALLOWANCE.DC_CABLE_POSITIVE_M,
        negativeM: PRELIMINARY_ALLOWANCE.DC_CABLE_NEGATIVE_M,
        estimated: true, adjustableByProjectHead: true,
      },
      mc4: {
        pairsPerNewString: PRELIMINARY_ALLOWANCE.MC4_PAIRS_PER_NEW_STRING,
        quantity: (a.preliminaryItems?.items || []).find(i => i.role === 'MC4_CONNECTOR')?.quantity ?? null,
        estimated: true, adjustableByProjectHead: true,
      },
      threePhaseConversion: a.preliminaryItems?.threePhaseConversion ?? false,
      lines: preliminaryLines,
      note: 'Preliminary quotation estimates. The Project Head adjusts them after site and configuration verification.',
    },

    // ---- additional materials --------------------------------------------
    additionalMaterials: {
      pathKey: a.fixedItems?.pathKey ?? null,
      resolved: a.fixedItems?.resolved ?? null,
      items: a.fixedItems?.items ?? [],
      definedPathKeys: a.fixedItems?.definedPathKeys ?? [],
      note: a.fixedItems?.resolved
        ? 'Approved catalog quantities for this upgrade path.'
        : 'No approved fixed-item quantities exist for this path. Nothing is produced and nothing is taken from another path.',
    },

    // ---- findings ---------------------------------------------------------
    engineeringWarnings: (a.checks || []).filter(c => c.status === CHECK.WARNING),
    blockedFindings: (a.checks || []).filter(c => c.status === CHECK.FAIL),
    unresolvedItems: unresolved,
    missingInputs: a.missingInputs ?? [],

    // ---- review state -----------------------------------------------------
    adjustments: [...adjustments],
    engineeringRemarks: [...(store.remarks.get(requestId) || [])],
    approvedBom: r.status === REQUEST_STATUS.APPROVED ? r.approvedConfiguration.lines : null,
    approvedConfiguration: r.status === REQUEST_STATUS.APPROVED ? r.approvedConfiguration : null,
    canApprove: r.status === REQUEST_STATUS.SUBMITTED,
    approvalBlockers: approvalBlockers(a, adjustments),
  });
}

function dcAcStatusFromChecks(a) {
  const dc = (a.checks || []).find(c => c.detail?.label === 'target configuration');
  if (!dc) return DCAC_STATUS.UNRESOLVED;
  return dc.status === CHECK.PASS ? DCAC_STATUS.VALID
    : dc.status === CHECK.WARNING ? DCAC_STATUS.WARNING
      : dc.status === CHECK.FAIL ? DCAC_STATUS.BLOCKED : DCAC_STATUS.UNRESOLVED;
}

const adjustmentKey = (d) => `${d.role}|${d.componentId ?? ''}`;

/**
 * An item still needing a Project Head decision. A RETAIN or REPLACE verdict is
 * resolved engineering even though it carries no quantity — retaining an
 * inverter adds nothing to the BOM.
 */
const needsDecision = (d) =>
  d.disposition === DISPOSITION.ENGINEERING_REVIEW
  || (d.disposition === DISPOSITION.ADD && d.quantity == null);

/** What still stands between this request and an approval. */
function approvalBlockers(assessment, adjustments) {
  const adjusted = new Set(adjustments.map(adjustmentKey));
  return Object.freeze((assessment.dispositions || [])
    .filter(d => needsDecision(d) && !adjusted.has(adjustmentKey(d)))
    .map(d => Object.freeze({ role: d.role, componentId: d.componentId ?? null, reason: d.note ?? null })));
}

// ---------------------------------------------------------------------------
// 3. Project Head adjustments
// ---------------------------------------------------------------------------

/**
 * Record a Project Head decision on an item C10 left unresolved or preliminary.
 *
 * Only those items are adjustable — a Project Head does not overwrite a
 * resolved engineering verdict here. A quantity must be explicit and
 * non-negative; every adjustment records who, when and why.
 */
export function setReviewAdjustment(store, { actor, requestId, adjustments = [], at }) {
  assertReviewer(actor);
  needAt(at);
  const r = getUpgradeRequest(store, actor, requestId);
  if (r.status !== REQUEST_STATUS.SUBMITTED)
    throw new UpgradeReviewError(REVIEW_ERROR.ALREADY_DECIDED,
      `Upgrade request ${requestId} is already ${r.status}.`, { requestId, status: r.status });

  const dispositions = r.assessment.dispositions || [];
  const adjustable = new Map(dispositions
    .filter(d => needsDecision(d) || d.basis === ITEM_BASIS.PRELIMINARY_ALLOWANCE || d.estimated === true)
    .map(d => [adjustmentKey(d), d]));

  const recorded = store.adjustments.get(requestId) || [];
  for (const adj of adjustments) {
    if (!adj || !adj.role)
      throw new UpgradeReviewError(REVIEW_ERROR.ADJUSTMENT_INVALID, 'Each adjustment needs a role.', { adj });
    const key = adjustmentKey(adj);
    const target = adjustable.get(key) ?? adjustable.get(`${adj.role}|`);
    if (!target)
      throw new UpgradeReviewError(REVIEW_ERROR.ADJUSTMENT_NOT_PERMITTED,
        `${adj.role}${adj.componentId ? ` / ${adj.componentId}` : ''} is not an unresolved or preliminary item. ` +
        'A resolved engineering verdict is not overwritten here.', { role: adj.role, componentId: adj.componentId ?? null });
    if (adj.quantity == null || Number.isNaN(Number(adj.quantity)) || Number(adj.quantity) < 0)
      throw new UpgradeReviewError(REVIEW_ERROR.ADJUSTMENT_INVALID,
        'An adjustment needs an explicit non-negative quantity. A blank is never treated as zero and a removed ' +
        'customer-owned item is never a negative quantity.', { adj });

    recorded.push(Object.freeze({
      role: adj.role,
      componentId: adj.componentId ?? target.componentId ?? null,
      quantity: Number(adj.quantity),
      unit: adj.unit ?? target.unit ?? null,
      previousQuantity: target.quantity ?? null,
      basis: 'PROJECT_HEAD_DECISION',
      reason: adj.reason ?? null,
      by: actor.userId, byRole: actor.role, at,
    }));
  }
  store.adjustments.set(requestId, recorded);
  return Object.freeze([...recorded]);
}

/** A free-text engineering remark on the review. Append-only. */
export function addEngineeringRemark(store, { actor, requestId, remark, at }) {
  assertReviewer(actor);
  needAt(at);
  getUpgradeRequest(store, actor, requestId);
  if (!remark) throw new UpgradeReviewError(REVIEW_ERROR.ADJUSTMENT_INVALID, 'A remark cannot be empty.');
  const list = store.remarks.get(requestId) || [];
  list.push(Object.freeze({ remark, by: actor.userId, byRole: actor.role, at }));
  store.remarks.set(requestId, list);
  return Object.freeze([...list]);
}

// ---------------------------------------------------------------------------
// 4. approval
// ---------------------------------------------------------------------------

/**
 * Assemble the final BOM from the assessment's dispositions plus the Project
 * Head's adjustments, and approve it.
 *
 * A line reaches the BOM only with an explicit quantity: either an approved
 * catalog/allowance figure, or a Project Head decision. Anything still
 * unresolved refuses the approval by name — it is never defaulted to zero.
 * RETAIN lines and removed customer-owned equipment carry no price and no
 * negative quantity.
 */
export function approveUpgradeConfiguration(store, { actor, requestId, at, remarks = null }) {
  assertReviewer(actor);
  needAt(at);
  const r = getUpgradeRequest(store, actor, requestId);
  const a = r.assessment;
  const adjustments = store.adjustments.get(requestId) || [];
  const byKey = new Map(adjustments.map(x => [adjustmentKey(x), x]));

  const blockers = approvalBlockers(a, adjustments);
  if (blockers.length)
    throw new UpgradeReviewError(REVIEW_ERROR.UNRESOLVED_ITEMS_REMAIN,
      `Cannot approve: ${blockers.length} item(s) remain unresolved. Each needs a Project Head decision; ` +
      'none is defaulted to zero.', { requestId, blockers });

  const lines = (a.dispositions || []).map(d => {
    const adj = byKey.get(adjustmentKey(d));
    const quantity = adj ? adj.quantity : d.quantity;
    const line = {
      role: d.role,
      componentId: d.componentId ?? adj?.componentId ?? null,
      disposition: adj ? DISPOSITION.ADD : d.disposition,
      quantity,
      unit: d.unit ?? adj?.unit ?? null,
      quantitySource: adj ? 'PROJECT_HEAD_DECISION' : (d.basis ?? 'C10_ASSESSMENT'),
      estimatedAtSubmission: d.estimated === true,
      adjustedByProjectHead: !!adj,
      note: d.note ?? null,
    };
    if (d.disposition === DISPOSITION.RETAIN || d.pricingImpact === 'NONE') {
      line.pricingImpact = 'NONE';
      line.customerOwned = d.removedPanelsOwnedByCustomer || d.removedUnitOwnedByCustomer || false;
    }
    return line;
  }).filter(l => l.quantity != null || l.disposition === DISPOSITION.RETAIN
    || l.disposition === DISPOSITION.REPLACE);

  for (const l of lines) {
    if (l.quantity != null && Number(l.quantity) < 0)
      throw new UpgradeReviewError(REVIEW_ERROR.ADJUSTMENT_INVALID,
        `A negative quantity reached the approved BOM for ${l.role}. C10 forbids it.`, { line: l });
  }

  const approved = approveUpgradeRequest(store, actor, requestId, {
    at, reason: remarks,
    configuration: {
      lines: lines.filter(l => l.componentId && l.quantity != null),
      allLines: lines,
      upgradePathId: a.identity?.upgradePathId ?? null,
      scenario: a.scenario,
      dcAcRatio: a.targetDcAcRatio ?? null,
      requiredPhase: a.requiredPhase ?? null,
      engineeringRemarks: [...(store.remarks.get(requestId) || []), ...(remarks ? [{ remark: remarks, by: actor.userId, byRole: actor.role, at }] : [])],
      projectHeadAdjustments: adjustments,
      // The quotation renders this. It never re-derives it (Data Contract §1).
      recalculationForbidden: true,
      recalculationNote: 'This configuration is the authoritative engineering result. The Cost Engine and the ' +
        'quotation consume it; neither recalculates the upgrade configuration.',
    },
  });
  return approved;
}

export function rejectUpgradeReview(store, { actor, requestId, at, reason = null }) {
  assertReviewer(actor);
  needAt(at);
  return rejectUpgradeRequest(store, actor, requestId, { at, reason });
}

/** The authoritative configuration, or null. Never a substitute, never a guess. */
export function authoritativeUpgradeConfiguration(store, { actor, requestId }) {
  assertCan(actor, CAPABILITY.BOM_VIEW);
  return authoritativeConfigurationFor(store, actor, requestId);
}

/** Project BOM lines from an approved configuration. Mapping only — no sizing. */
export function toProjectBomLines(configuration) {
  if (!configuration || configuration.authoritative !== true) return null;
  const all = configuration.allLines || configuration.lines || [];

  // A REPLACE line names the OLD component — the unit leaving the roof. What the
  // Project BOM needs is the component going ON, which the approval records as
  // the paired ADD line for the same role. Pair them here so an approved
  // replacement is not dropped, and consume the ADD line so it is not emitted
  // twice. If no replacement component exists the pair cannot be formed and
  // nothing is emitted — one is never fabricated.
  const consumed = new Set();
  const out = [];

  for (const l of all) {
    if (consumed.has(l)) continue;

    if (l.disposition === DISPOSITION.REPLACE) {
      const replacement = all.find(x => x !== l && x.role === l.role
        && x.disposition === DISPOSITION.ADD && x.componentId && x.quantity != null);
      if (!replacement) continue;              // unresolved — never invented
      consumed.add(replacement);
      out.push({
        componentId: replacement.componentId,  // the NEW component
        role: l.role,
        quantity: replacement.quantity,        // the approved quantity
        disposition: DISPOSITION.REPLACE,
        replacesComponentId: l.componentId ?? null,
        removedUnitOwnedByCustomer: l.customerOwned === true,
        removedUnitPricingImpact: 'NONE',      // the removed unit is never priced
      });
      continue;
    }

    if (l.disposition === DISPOSITION.ADD || l.disposition === DISPOSITION.RETAIN) {
      if (!l.componentId || l.quantity == null) continue;
      out.push({
        componentId: l.componentId, role: l.role, quantity: l.quantity,
        disposition: l.disposition,
      });
    }
  }

  for (const l of out) {
    if (l.quantity != null && Number(l.quantity) < 0)
      throw new UpgradeReviewError(REVIEW_ERROR.ADJUSTMENT_INVALID,
        `A negative quantity reached the project BOM for ${l.role}. C10 forbids it.`, { line: l });
  }

  return Object.freeze(out.map(l => Object.freeze({
    ...l,
    source: 'C10_APPROVED_UPGRADE_CONFIGURATION',
    upgradePathId: configuration.upgradePathId ?? null,
  })));
}

export function listUpgradeReviews(store, { actor }) {
  return listUpgradeRequests(store, actor);
}

export {
  SCENARIO, DISPOSITION, DCAC_STATUS, PANEL_HEALTH, REQUEST_STATUS,
  PRELIMINARY_ALLOWANCE, MISSING_INPUT, FINDING, ASSESSMENT_STATUS, UpgradeRequestError,
};

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}
