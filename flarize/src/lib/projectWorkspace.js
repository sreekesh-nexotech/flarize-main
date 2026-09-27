/**
 * PROJECT HEAD WORKSPACE — APPLICATION SERVICE LAYER.  (Phase 3, PART C/D/E)
 *
 * This is the application layer, not an engine. It contains NO engineering
 * rule, NO commercial formula, NO threshold, NO rate and NO default value.
 * Every decision is delegated to an existing frozen engine:
 *
 *   projectBom.js          project BOM authority (create / edit / remove)
 *   engineeringChecker.js  validation — the only source of VALID/WARNING/BLOCKED
 *   bomLock.js             lock policy and the immutable snapshot
 *   costEngine.js          the ten cost heads
 *   pricingEngine.js       margin, discount, approval, GST, customer price
 *   commercialHistory.js   the ONLY history mechanism
 *   projectRateCard.js     the ONLY project rate source
 *   rbac.js                capability + ownership enforcement
 *
 * If a value is not configured, this layer reports the engine's own status.
 * It never substitutes zero, never picks a nearest match, never invents a
 * quantity and never re-implements a formula so the screen "looks complete".
 *
 * DETERMINISM: no clock. Every operation takes an `at` from the caller.
 */

import { ROLES, CATEGORY_TO_ROLE, roleForLine } from './bomRoles.js';
import {
  createProjectBom, setComponent, setQuantity, removeRole,
  effectiveLines, diffAgainstPackage, isProjectEditableRole,
  PROJECT_BOM_STATUS, PROJECT_EDITABLE_ROLES,
} from './projectBom.js';
import { checkProjectBom, CHECK_STATUS, SEVERITY, RULES_VERSION, CHECKER_RULES } from './engineeringChecker.js';
import { attemptLock, lockSummary, LOCK_RESULT, requiresAcknowledgement } from './bomLock.js';
import { calculateCost, COST_HEAD_ORDER, COST_HEAD_OWNER, COST_STATUS } from './costEngine.js';
import { calculatePricing, PRICING_STATUS, APPROVAL } from './pricingEngine.js';
import { historyView, getCurrentVersion, getHistory, compareVersions, CONFIG_TYPE, CONFIG_OWNER } from './commercialHistory.js';
import { listRates } from './projectRateCard.js';
import { toComponent, isSelectable } from './componentIdentity.js';
import { toBatteryMaster, isPermanentlyUnselectable } from './batteryMaster.js';
import { assertCan, assertCanEditBomRole, CAPABILITY, capabilitiesOf, isIndividualSalesRole, ROLE } from './rbac.js';
import { assertPackageSelectableByActor } from './packageApproval.js';

export const WORKSPACE_VERSION = 'workspace.1';

export const WORKSPACE_ERROR = {
  PROJECT_NOT_FOUND: 'PROJECT_NOT_FOUND',
  PROJECT_EXISTS: 'PROJECT_EXISTS',
  PACKAGE_NOT_FOUND: 'PACKAGE_NOT_FOUND',
  CONFIGURATION_INCOMPLETE: 'CONFIGURATION_INCOMPLETE',
  NO_BOM: 'NO_BOM',
  BOM_LOCKED: 'BOM_LOCKED',
  BOM_NOT_LOCKED: 'BOM_NOT_LOCKED',
  ROLE_NOT_EDITABLE: 'ROLE_NOT_EDITABLE',
  COMPONENT_NOT_IN_CATALOG: 'COMPONENT_NOT_IN_CATALOG',
  MISSING_TIMESTAMP: 'MISSING_TIMESTAMP',
};

export class WorkspaceError extends Error {
  constructor(code, message, detail = null) {
    super(message);
    this.name = 'WorkspaceError';
    this.code = code;
    this.detail = detail;
  }
}

/** The mutable application store. Engines stay pure; only this holds state. */
export function createWorkspaceStore() {
  return { workspaceVersion: WORKSPACE_VERSION, projects: {} };
}

const need = (at) => {
  if (!at) throw new WorkspaceError(WORKSPACE_ERROR.MISSING_TIMESTAMP,
    'Every workspace operation requires a caller-supplied `at` timestamp. The engines are deterministic and must not read a clock.');
  return at;
};

const project = (store, projectId) => {
  const p = store?.projects?.[projectId];
  if (!p) throw new WorkspaceError(WORKSPACE_ERROR.PROJECT_NOT_FOUND, `Project "${projectId}" does not exist.`, { projectId });
  return p;
};

const audit = (p, actor, action, detail) => {
  p.history.push({ action, by: actor.userId, role: actor.role, at: detail?.at ?? null, detail: detail ?? null });
};

// ============================================================ 1–6 project setup

export function createProject(store, { actor, projectId, customer = null, at }) {
  assertCan(actor, CAPABILITY.PROJECT_CREATE);
  need(at);
  if (store.projects[projectId])
    throw new WorkspaceError(WORKSPACE_ERROR.PROJECT_EXISTS, `Project "${projectId}" already exists.`, { projectId });
  store.projects[projectId] = {
    projectId,
    customer,
    architecture: null, sysType: null, sizeKw: null, phase: null, tier: null,
    packageId: null,
    bom: null,
    lastValidation: null,
    lock: null,
    acknowledgements: [],
    costInputs: {},          // distanceKm, vehicleType, installationType, structureMaterialCost, specialWorks
    discount: null,
    createdBy: actor.userId, createdAt: at,
    history: [],
  };
  audit(store.projects[projectId], actor, 'PROJECT_CREATED', { at, customer });
  return openProject(store, { actor, projectId });
}

export function openProject(store, { actor, projectId }) {
  assertCan(actor, CAPABILITY.PROJECT_VIEW);
  const p = project(store, projectId);
  return {
    projectId: p.projectId,
    customer: p.customer,
    architecture: p.architecture, sysType: p.sysType, sizeKw: p.sizeKw, phase: p.phase, tier: p.tier,
    packageId: p.packageId,
    bomStatus: p.bom?.status ?? null,
    hasBom: !!p.bom,
    locked: p.bom?.status === PROJECT_BOM_STATUS.LOCKED,
    validationStatus: p.lastValidation?.status ?? null,
    createdBy: p.createdBy, createdAt: p.createdAt,
    capabilities: capabilitiesOf(actor.role),
    workspaceVersion: WORKSPACE_VERSION,
  };
}

export function listProjects(store, { actor }) {
  assertCan(actor, CAPABILITY.PROJECT_VIEW);
  return Object.keys(store.projects).sort().map(id => openProject(store, { actor, projectId: id }));
}

/** Customer, architecture, system type, size, phase, tier (brief items 2–6). */
export function setProjectConfiguration(store, { actor, projectId, at, ...fields }) {
  assertCan(actor, CAPABILITY.PROJECT_CONFIGURE);
  need(at);
  const p = project(store, projectId);
  if (p.bom?.status === PROJECT_BOM_STATUS.LOCKED)
    throw new WorkspaceError(WORKSPACE_ERROR.BOM_LOCKED,
      'The project BOM is LOCKED. Its configuration cannot be changed; create a revision instead.');
  const allowed = ['customer', 'architecture', 'sysType', 'sizeKw', 'phase', 'tier'];
  const changed = {};
  for (const k of allowed)
    if (fields[k] !== undefined) { changed[k] = { from: p[k], to: fields[k] }; p[k] = fields[k]; }
  audit(p, actor, 'PROJECT_CONFIGURED', { at, changed });
  return openProject(store, { actor, projectId });
}

// ============================================================ 7 package selection

/**
 * Approved packages matching the project configuration.
 *
 * `approvalStatus` is reported exactly as the registry records it. Nothing is
 * auto-approved here, and a PROPOSED package is never silently promoted.
 */
export function listPackages(env, { actor, sysType = null, sizeKw = null, phase = null, tier = null } = {}) {
  assertCan(actor, CAPABILITY.PROJECT_VIEW);
  const reg = env?.packageRegistry?.packages || [];
  const size = sizeKw == null ? null : String(sizeKw);
  return reg
    .filter(p => (!sysType || p.systemType === sysType))
    .filter(p => (!size || String(p.size) === size))
    .filter(p => (!phase || p.phase === phase))
    .filter(p => (!tier || p.tier === tier))
    .map(p => ({
      packageId: p.packageId, systemType: p.systemType, size: p.size, phase: p.phase, tier: p.tier,
      approvalStatus: p.approvalStatus, engineeringStatus: p.engineeringStatus,
      approvedBy: p.approvedBy ?? null, approvedAt: p.approvedAt ?? null,
      blockers: p.blockers || [],
      componentCount: (p.components || []).length,
      componentsApproved: (p.components || []).filter(c => c.approvalStatus === 'APPROVED').length,
      fullyApproved: (p.components || []).length > 0
        && (p.components || []).every(c => c.approvalStatus === 'APPROVED'),
    }))
    .sort((a, b) => a.packageId < b.packageId ? -1 : 1);
}

/** Registry component role keys are catalog category keys; map via bomRoles. */
function roleForRegistryComponent(c) {
  return roleForLine({ category: c.role, itemId: c.componentId }) || CATEGORY_TO_ROLE[c.role] || ROLES.OTHER;
}

/**
 * Select a package and materialise its BOM as the project's package default.
 *
 * Quantities come from the registry as recorded. A component with no recorded
 * quantity is carried with the quantity the registry holds — never a guessed 1.
 */
export function selectPackage(store, env, { actor, projectId, packageId, at }) {
  assertCan(actor, CAPABILITY.PACKAGE_SELECT);
  need(at);
  const p = project(store, projectId);
  if (p.bom?.status === PROJECT_BOM_STATUS.LOCKED)
    throw new WorkspaceError(WORKSPACE_ERROR.BOM_LOCKED, 'The project BOM is LOCKED. Create a revision instead.');

  const pkg = (env?.packageRegistry?.packages || []).find(x => x.packageId === packageId);
  if (!pkg) throw new WorkspaceError(WORKSPACE_ERROR.PACKAGE_NOT_FOUND, `Package "${packageId}" is not in the registry.`, { packageId });

  // ENFORCEMENT: Sales roles can only select APPROVED packages
  assertPackageSelectableByActor(env?.packageRegistry, { actor, packageId });

  const lines = (pkg.components || [])
    .map(c => ({
      role: roleForRegistryComponent(c),
      componentId: c.componentId ?? null,
      quantity: c.quantity ?? null,
      packageApprovalStatus: c.approvalStatus,
      approvedByDecision: c.approvedByDecision ?? null,
    }))
    .sort((a, b) => a.role < b.role ? -1 : a.role > b.role ? 1 : 0);

  p.packageId = packageId;
  if (p.tier == null) p.tier = pkg.tier ?? null;
  if (p.sysType == null) p.sysType = pkg.systemType ?? null;
  if (p.phase == null) p.phase = pkg.phase ?? null;
  if (p.sizeKw == null && pkg.size != null && Number.isFinite(Number(pkg.size))) p.sizeKw = Number(pkg.size);

  p.bom = createProjectBom({
    projectId, packageId,
    architecture: p.architecture, sysType: p.sysType, tier: p.tier,
    sizeKw: p.sizeKw, phase: p.phase,
    lines: lines.map(l => ({ role: l.role, componentId: l.componentId, quantity: l.quantity })),
    createdBy: actor.userId, createdAt: at,
  });
  p.lastValidation = null;
  p.lock = null;
  audit(p, actor, 'PACKAGE_SELECTED', { at, packageId, lineCount: lines.length });
  return viewBom(store, env, { actor, projectId });
}

// ============================================================ 8–10 BOM view/edit

/** Item lookup across the catalog by id. Identity only — never by name. */
function catalogItem(env, componentId) {
  const cats = env?.catalog?.categories || {};
  for (const key of Object.keys(cats).sort()) {
    const hit = (cats[key].items || []).find(i => i.id === componentId);
    if (hit) return { ...hit, _category: key };
  }
  return null;
}

/** The effective project BOM with provenance, for display. */
export function viewBom(store, env, { actor, projectId }) {
  assertCan(actor, CAPABILITY.BOM_VIEW);
  const p = project(store, projectId);
  if (!p.bom) throw new WorkspaceError(WORKSPACE_ERROR.NO_BOM, 'No package has been selected for this project yet.');

  const lines = effectiveLines(p.bom).map(l => {
    const item = l.componentId ? catalogItem(env, l.componentId) : null;
    return {
      role: l.role,
      componentId: l.componentId,
      componentName: item?.name ?? null,
      category: item?._category ?? null,
      componentStatus: item?.status ?? null,
      quantity: l.quantity,
      quantityConfigured: l.quantity != null,
      selectionMethod: l.selectionMethod,
      selectedBy: l.selectedBy,
      selectionTimestamp: l.selectionTimestamp,
      reason: l.reason ?? null,
      editable: isProjectEditableRole(l.role),
      inCatalog: !!item,
    };
  });

  return {
    projectId, packageId: p.bom.packageId,
    architecture: p.bom.architecture, sysType: p.bom.sysType,
    sizeKw: p.bom.sizeKw, phase: p.bom.phase, tier: p.bom.tier,
    status: p.bom.status,
    lines,
    diff: diffAgainstPackage(p.bom),
    removedRoles: [...(p.bom.removedRoles || [])],
    editableRoles: [...PROJECT_EDITABLE_ROLES].sort(),
    validationStatus: p.lastValidation?.status ?? null,
    locked: p.bom.status === PROJECT_BOM_STATUS.LOCKED,
  };
}

/**
 * Components the Project Head may choose for a role.
 *
 * Lifecycle filtering only (componentIdentity.isSelectable) plus the battery
 * resolvability gate already defined by batteryMaster.isPermanentlyUnselectable.
 * ENGINEERING APPROVAL IS NOT FILTERED HERE: a pending component stays visible
 * and the Engineering Checker reports it. Hiding it would be a silent
 * substitution, which the Project BOM authority forbids.
 */
export function availableComponents(env, { actor, role }) {
  assertCan(actor, CAPABILITY.BOM_VIEW);
  const cats = env?.catalog?.categories || {};
  const out = [];
  for (const key of Object.keys(cats).sort()) {
    if (roleForLine({ category: key }) !== role && !((cats[key].items || []).some(i => roleForLine({ category: key, itemId: i.id }) === role)))
      continue;
    for (const raw of cats[key].items || []) {
      if (roleForLine({ category: key, itemId: raw.id }) !== role) continue;
      const c = toComponent(key, raw);
      if (!isSelectable(c)) continue;
      const battery = key === 'battery';
      const rec = battery ? toBatteryMaster(raw, (env?.batteryMaster || {})[raw.id] || {}) : null;
      if (battery && isPermanentlyUnselectable(rec)) continue;
      out.push({
        componentId: c.componentId, name: raw.name ?? null, category: key, role,
        status: raw.status ?? null, tiers: c.tiers,
        engineeringStatus: rec ? rec.engineeringStatus : null,
        engineeringNote: rec && rec.engineeringStatus !== 'APPROVED'
          ? 'Selectable, but the Engineering Checker will report its approval state. Not hidden and not auto-substituted.'
          : null,
      });
    }
  }
  return out.sort((a, b) => a.componentId < b.componentId ? -1 : 1);
}

/**
 * Free-text search over selectable catalog components across EVERY checker role
 * (PH BOM Configuration Workspace "Add component" field). Same selectability and
 * battery-master rules as availableComponents(); matches id / name / brand /
 * category, case-insensitive. Returns at most `limit` rows.
 */
export function searchComponents(env, { actor, q, limit = 25 }) {
  assertCan(actor, CAPABILITY.BOM_VIEW);
  const term = String(q ?? '').trim().toLowerCase();
  if (term.length < 2) return [];
  const cats = env?.catalog?.categories || {};
  const out = [];
  for (const key of Object.keys(cats).sort()) {
    for (const raw of cats[key].items || []) {
      const hay = `${raw.id} ${raw.name ?? ''} ${raw.brand ?? ''} ${raw.model ?? ''} ${key}`.toLowerCase();
      if (!hay.includes(term)) continue;
      const c = toComponent(key, raw);
      if (!isSelectable(c)) continue;
      const battery = key === 'battery';
      const rec = battery ? toBatteryMaster(raw, (env?.batteryMaster || {})[raw.id] || {}) : null;
      if (battery && isPermanentlyUnselectable(rec)) continue;
      out.push({
        componentId: c.componentId, name: raw.name ?? null, brand: raw.brand ?? null, category: key,
        role: roleForLine({ category: key, itemId: raw.id }),
        status: raw.status ?? null, approvalStatus: raw.approvalStatus ?? null, tiers: c.tiers, unit: raw.unit ?? null,
        engineeringStatus: rec ? rec.engineeringStatus : null,
      });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

export function editBomComponent(store, env, { actor, projectId, role, componentId, quantity, reason = null, at }) {
  assertCanEditBomRole(actor, role);
  need(at);
  const p = project(store, projectId);
  if (!p.bom) throw new WorkspaceError(WORKSPACE_ERROR.NO_BOM, 'No package has been selected for this project yet.');
  if (!isProjectEditableRole(role))
    throw new WorkspaceError(WORKSPACE_ERROR.ROLE_NOT_EDITABLE, `Role "${role}" is not a project-editable role.`, { role });
  if (componentId && !catalogItem(env, componentId))
    throw new WorkspaceError(WORKSPACE_ERROR.COMPONENT_NOT_IN_CATALOG,
      `Component "${componentId}" is not in the catalog. A BOM line must reference a real component id.`, { componentId });

  // projectBom performs NO validation by design — an incompatible choice is
  // accepted here and reported by the checker, never silently corrected.
  p.bom = setComponent(p.bom, { role, componentId, quantity, selectedBy: actor.userId, at, reason });
  p.lastValidation = null;            // any edit invalidates the previous verdict
  audit(p, actor, 'BOM_COMPONENT_SET', { at, role, componentId, quantity, reason });
  return viewBom(store, env, { actor, projectId });
}

export function editBomQuantity(store, env, { actor, projectId, role, quantity, at }) {
  assertCanEditBomRole(actor, role);
  need(at);
  const p = project(store, projectId);
  if (!p.bom) throw new WorkspaceError(WORKSPACE_ERROR.NO_BOM, 'No package has been selected for this project yet.');
  p.bom = setQuantity(p.bom, { role, quantity, selectedBy: actor.userId, at });
  p.lastValidation = null;
  audit(p, actor, 'BOM_QUANTITY_SET', { at, role, quantity });
  return viewBom(store, env, { actor, projectId });
}

export function removeBomRole(store, env, { actor, projectId, role, reason = null, at }) {
  assertCanEditBomRole(actor, role);
  need(at);
  const p = project(store, projectId);
  if (!p.bom) throw new WorkspaceError(WORKSPACE_ERROR.NO_BOM, 'No package has been selected for this project yet.');
  p.bom = removeRole(p.bom, { role, selectedBy: actor.userId, at, reason });
  p.lastValidation = null;
  audit(p, actor, 'BOM_ROLE_REMOVED', { at, role, reason });
  return viewBom(store, env, { actor, projectId });
}

// ============================================================ 11–13 checker

const RULE_BY_ID = Object.fromEntries(CHECKER_RULES.map(r => [r.ruleId, r]));

/** Run the Engineering Checker. The verdict comes from the engine, not here. */
export function runChecker(store, env, { actor, projectId, at, upgrade = null, futureUpgrade = false }) {
  assertCan(actor, CAPABILITY.BOM_RUN_CHECKER);
  need(at);
  const p = project(store, projectId);
  if (!p.bom) throw new WorkspaceError(WORKSPACE_ERROR.NO_BOM, 'No package has been selected for this project yet.');

  const validation = checkProjectBom({
    bom: p.bom, catalog: env.catalog, batteryMaster: env.batteryMaster || {},
    at, catalogVersion: env.catalogVersion ?? null, upgrade, futureUpgrade,
  });
  p.lastValidation = validation;
  audit(p, actor, 'CHECKER_RUN', { at, status: validation.status, counts: validation.counts });
  return validationView(env, validation);
}

/** Finding detail for item 13: rule, severity, component, reason, source. */
export function validationView(env, validation) {
  if (!validation) return null;
  const summary = lockSummary(validation);
  return {
    status: validation.status,                       // VALID | WARNING | BLOCKED
    counts: validation.counts,
    rulesVersion: validation.rulesVersion,
    catalogVersion: validation.catalogVersion,
    at: validation.at,
    deterministicKey: validation.deterministicKey,
    canLock: summary.canLock,
    label: summary.label,
    findings: validation.findings.map(f => ({
      ruleId: f.ruleId,
      rule: RULE_BY_ID[f.ruleId]?.description ?? null,
      category: f.category,
      severity: f.severity,
      componentIds: f.componentIds,
      components: f.componentIds.map(id => ({ componentId: id, name: catalogItem(env, id)?.name ?? null })),
      message: f.message,
      reason: f.reason,
      source: f.source,
      inputs: f.inputs,
      requiresAcknowledgement: f.severity === SEVERITY.WARNING && requiresAcknowledgement(f.ruleId),
    })),
  };
}

export function getValidation(store, env, { actor, projectId }) {
  assertCan(actor, CAPABILITY.BOM_VIEW);
  const p = project(store, projectId);
  return p.lastValidation ? validationView(env, p.lastValidation) : null;
}

// ============================================================ 16–17 lock

/**
 * Lock the BOM. The lock POLICY is bomLock.attemptLock — this function only
 * carries the result. A rejected lock leaves the BOM untouched and editable.
 */
export function lockBom(store, env, { actor, projectId, at, acknowledgements = [], upgrade = null, futureUpgrade = false }) {
  assertCan(actor, CAPABILITY.BOM_LOCK);
  need(at);
  const p = project(store, projectId);
  if (!p.bom) throw new WorkspaceError(WORKSPACE_ERROR.NO_BOM, 'No package has been selected for this project yet.');

  const acks = acknowledgements.map(a => ({
    ruleId: a.ruleId, acknowledgedBy: actor.userId, acknowledgedAt: at, reason: a.reason ?? null,
  }));
  const result = attemptLock({
    bom: p.bom, catalog: env.catalog, batteryMaster: env.batteryMaster || {},
    catalogVersion: env.catalogVersion ?? null,
    lockedBy: actor.userId, lockedAt: at, acknowledgements: acks,
    priceLookup: env.priceLookup || {}, upgrade, futureUpgrade,
  });

  if (result.validation) p.lastValidation = result.validation;
  if (result.locked) {
    p.bom = result.bom;
    p.lock = result.snapshot;
    p.acknowledgements = acks;
  }
  audit(p, actor, 'BOM_LOCK_ATTEMPT', { at, result: result.result, locked: result.locked });

  return {
    result: result.result,
    locked: result.locked,
    reason: result.reason,
    missingAcknowledgements: result.missingAcknowledgements,
    validation: result.validation ? validationView(env, result.validation) : null,
    snapshot: result.locked ? snapshotView(p) : null,
  };
}

/** Item 17 — the immutable snapshot exactly as bomLock produced it. */
export function snapshotView(p) {
  if (!p.lock) return null;
  return {
    snapshotId: p.lock.snapshotId ?? null,
    projectId: p.lock.projectId,
    packageId: p.lock.packageId,
    architecture: p.lock.architecture,
    status: p.lock.status,
    lockedBy: p.lock.lockedBy, lockedAt: p.lock.lockedAt,
    dataVersion: p.lock.dataVersion ?? null,
    rulesVersion: p.lock.rulesVersion,
    validationStatus: p.lock.validationStatus,
    engineeringStatus: p.lock.engineeringStatus ?? null,
    acknowledgements: p.lock.acknowledgements ?? [],
    lines: (p.lock.lines || []).map(l => ({ ...l })),
    immutable: Object.isFrozen(p.lock),
  };
}

export function getSnapshot(store, { actor, projectId }) {
  assertCan(actor, CAPABILITY.BOM_VIEW);
  return snapshotView(project(store, projectId));
}

// ============================================================ PART D cost panel

/** Project cost inputs owned by the Project Head (distance, vehicle, works). */
export function setCostInputs(store, { actor, projectId, at, inputs = {} }) {
  assertCan(actor, CAPABILITY.COST_INPUT_EDIT);
  need(at);
  const p = project(store, projectId);
  const allowed = ['distanceKm', 'vehicleType', 'installationType', 'structureMaterialCost',
                   'specialWorks', 'rateEffectiveAt', 'sizeKey'];
  const changed = {};
  for (const k of allowed)
    if (inputs[k] !== undefined) { changed[k] = { from: p.costInputs[k] ?? null, to: inputs[k] }; p.costInputs[k] = inputs[k]; }
  audit(p, actor, 'COST_INPUTS_SET', { at, changed });
  return { projectId, costInputs: { ...p.costInputs } };
}

/**
 * Render a cost head for the panel.
 *
 * An unconfigured head has `amount: null` and `display: null`. It is NEVER
 * rendered as 0. `configured:false` is what the UI must show as BLOCKED.
 */
function headView(h) {
  return {
    head: h.head, owner: h.owner,
    amount: h.amount,                       // null when not configured — never 0
    configured: h.amount != null,
    display: h.amount == null ? null : h.amount,
    status: h.status,
    blocked: h.amount == null,
    formula: h.formula, inputs: h.inputs, source: h.source,
    configVersion: h.configVersion, note: h.note ?? null,
    ...(h.lines ? { lines: h.lines } : {}),
  };
}

export function costPanel(store, env, { actor, projectId, at }) {
  assertCan(actor, CAPABILITY.COST_VIEW);
  need(at);
  const p = project(store, projectId);
  if (!p.lock)
    return {
      projectId, available: false,
      status: COST_STATUS.UNAVAILABLE,
      blocked: true,
      blockingReason: 'Cost is not available until the project BOM is LOCKED. Lock the BOM first.',
      heads: [], totalActualProjectCost: null, errors: [],
    };

  const cost = calculateCost({
    snapshot: p.lock,
    config: env.costConfig,
    priceMaster: env.priceMaster || {},
    rateCard: env.rateCard || null,
    project: {
      sizeKw: p.sizeKw, sizeKey: p.costInputs.sizeKey ?? (p.sizeKw != null ? String(p.sizeKw) : null),
      installationType: p.costInputs.installationType ?? null,
      phase: p.phase, sysType: p.sysType, tier: p.tier,
      distanceKm: p.costInputs.distanceKm ?? null,
      vehicleType: p.costInputs.vehicleType ?? null,
      structureMaterialCost: p.costInputs.structureMaterialCost ?? null,
      specialWorks: p.costInputs.specialWorks || [],
      rateEffectiveAt: p.costInputs.rateEffectiveAt ?? null,
    },
    calculatedAt: at,
    catalogVersion: env.catalogVersion ?? null,
    procurementPriceVersion: env.procurementPriceVersion ?? null,
    landedCostVersion: env.landedCostVersion ?? null,
  });

  p.lastCost = cost;
  return {
    projectId, available: true,
    status: cost.status,
    blocked: cost.status !== COST_STATUS.COMPLETE,
    blockingReason: cost.status === COST_STATUS.COMPLETE ? null
      : 'One or more cost heads are not configured. The total cannot be computed and must not be shown as zero.',
    costEngineVersion: cost.costEngineVersion,
    costConfigVersion: cost.costConfigVersion,
    projectRateCardVersion: cost.projectRateCardVersion,
    calculatedAt: cost.calculatedAt,
    heads: COST_HEAD_ORDER.map(h => headView(cost.heads[h])),
    directProjectCost: cost.directProjectCost,
    totalActualProjectCost: cost.totalActualProjectCost,       // null when incomplete
    totalConfigured: cost.totalActualProjectCost != null,
    errors: cost.errors.map(e => ({ code: e.code, head: e.head, message: e.message, detail: e.detail ?? null })),
    ownership: COST_HEAD_OWNER,
  };
}

/** Sales/Sales-Head discount request. The engine decides whether it survives. */
export function setDiscount(store, { actor, projectId, at, discount }) {
  assertCan(actor, CAPABILITY.DISCOUNT_REQUEST);
  need(at);
  const p = project(store, projectId);
  p.discount = discount ? { ...discount, requestedBy: actor.userId, requestedAt: at } : null;
  audit(p, actor, 'DISCOUNT_SET', { at, discount: p.discount });
  return { projectId, discount: p.discount };
}

export function pricingPanel(store, env, { actor, projectId, at, extras = [], customerSideExpenses = [] }) {
  assertCan(actor, CAPABILITY.PRICING_VIEW);
  need(at);
  const p = project(store, projectId);
  const cost = costPanel(store, env, { actor, projectId, at });
  if (!cost.available || cost.blocked)
    return {
      projectId, available: false, blocked: true,
      blockingReason: cost.blockingReason,
      costStatus: cost.status,
      errors: cost.errors,
      listPrice: null, sellingPriceBeforeGST: null, gstAmount: null, customerPrice: null,
    };

  const pricing = calculatePricing({
    costResult: p.lastCost,
    margin: env.costConfig?.margin || {},
    gst: env.costConfig?.gst || {},
    tier: p.tier,
    discount: p.discount,
    extras, customerSideExpenses,
    pricedAt: at,
  });

  if (pricing.status !== PRICING_STATUS.COMPLETE)
    return {
      projectId, available: true, blocked: true,
      blockingReason: pricing.errors?.[0]?.message ?? 'Pricing rejected.',
      error: pricing.error,
      errors: (pricing.errors || []).map(e => ({ code: e.code, message: e.message, detail: e.detail ?? null })),
      listPrice: null, sellingPriceBeforeGST: null, gstAmount: null, customerPrice: null,
      approval: null,
    };

  p.lastPricing = pricing;
  return {
    projectId, available: true, blocked: false,
    pricingEngineVersion: pricing.pricingEngineVersion,
    totalActualProjectCost: pricing.totalActualProjectCost,
    tier: pricing.tier,
    marginType: pricing.marginType,
    targetMarginPct: pricing.targetMarginPct,
    minimumMarginPct: pricing.minimumMarginPct,
    marginFormula: pricing.marginFormula,
    listPrice: pricing.listSellingPriceBeforeGST,
    discount: pricing.discount,
    discountAmount: pricing.discountAmount,
    sellingPriceBeforeGST: pricing.sellingPriceBeforeGST,
    grossProfit: pricing.grossProfit,
    actualGrossMarginPct: pricing.actualGrossMarginPct,
    approval: pricing.approval,
    approvalRequired: pricing.approval !== APPROVAL.NONE_REQUIRED,
    approvalReason: pricing.approvalReason,
    gstRegime: pricing.gstRegime,
    gstRatePct: pricing.gstRatePct,
    gstComponents: pricing.gstComponents,
    gstAmount: pricing.gstAmount,
    priceExcludingGST: pricing.priceExcludingGST,
    customerPrice: pricing.priceIncludingGST,
    customerTotalIncludingGST: pricing.customerTotalIncludingGST,
    extras: pricing.extras,
    customerSideExpenses: pricing.customerSideExpenses,
    errors: (pricing.errors || []).map(e => ({ code: e.code, message: e.message })),
  };
}

// ============================================================ PART E history

/**
 * CURRENT + HISTORY for a commercial configuration.
 *
 * Delegates entirely to commercialHistory.js. This layer creates no second
 * history store, no cache and no derived timeline of its own.
 */
export function commercialHistoryPanel(env, { actor, configType, recordId }) {
  assertCan(actor, CAPABILITY.COMMERCIAL_HISTORY_VIEW);
  const store = env?.historyStore;
  if (!store) return { configType, recordId, current: null, history: [], available: false };

  const view = historyView(store, configType, recordId);
  const versions = getHistory(store, configType, recordId);
  const changes = [];
  for (let i = 0; i < versions.length; i++) {
    const prev = i > 0 ? versions[i - 1] : null;
    const cur = versions[i];
    changes.push({
      versionId: cur.versionId,
      changedBy: cur.changedBy,
      changedAt: cur.changedAt,
      changeReason: cur.changeReason,
      effectiveFrom: cur.effectiveFrom,
      status: cur.status,
      oldValue: prev ? prev.value : null,
      newValue: cur.value,
      isInitial: !prev,
      diff: prev ? compareVersions(prev, cur) : null,
    });
  }
  return {
    configType, recordId,
    owner: CONFIG_OWNER[configType] ?? null,
    available: true,
    current: getCurrentVersion(store, configType, recordId) ?? null,
    history: changes.reverse(),                 // newest first for display
    view,
  };
}

export function configTypes({ actor }) {
  assertCan(actor, CAPABILITY.COMMERCIAL_HISTORY_VIEW);
  return Object.values(CONFIG_TYPE).sort().map(t => ({ configType: t, owner: CONFIG_OWNER[t] }));
}

export function rateCardPanel(env, { actor }) {
  assertCan(actor, CAPABILITY.COMMERCIAL_HISTORY_VIEW);
  return env?.rateCard ? { cardVersion: env.rateCard.cardVersion ?? null, rates: listRates(env.rateCard) }
                       : { cardVersion: null, rates: [], available: false };
}

export { CHECK_STATUS, SEVERITY, RULES_VERSION, LOCK_RESULT, PROJECT_BOM_STATUS };
