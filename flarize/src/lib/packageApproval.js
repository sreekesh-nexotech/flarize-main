/**
 * PACKAGE APPROVAL SERVICE.  (Master Plan — Step 2; extended by Phase 3 V4)
 *
 * Lifecycle management for the package registry. In V4, a package now moves
 * through the following states:
 *
 *   DRAFT ─→ SUBMITTED ─→ APPROVED
 *              │              │
 *              └→ REJECTED    └→ (revised — a new DRAFT with revisionNumber+1)
 *                                └→ (superseded — supersededBy points to the winner)
 *                                └→ ARCHIVED (only once superseded)
 *
 * V4 changes:
 *   1. Approval capability is `PACKAGE_APPROVE` — held only by ADMIN. The
 *      legacy `ENGINEERING_APPROVE` string is preserved on ENGINEERING as an
 *      anti-restart invariant but is no longer consulted by this module.
 *   2. Approval is gated by a fresh `lastValidation`: it must exist, match
 *      the current revision, and carry status VALID.
 *   3. Approving a new revision automatically supersedes the prior APPROVED
 *      revision of the same comboKey.
 *   4. Additional authoring methods (createPackage, duplicatePackage,
 *      createRevision, editPackage, submitPackage, archivePackage,
 *      runPackageChecker) provide the PROJECT_HEAD authoring flow.
 *
 * The engineering checker is imported from `engineeringChecker.js` UNCHANGED
 * and called through its published contract. This module invents no engine
 * logic — it only wires validation input from a package into checkProjectBom.
 */

import { assertCan, CAPABILITY, ROLE, isIndividualSalesRole } from './rbac.js';
import { checkProjectBom } from './engineeringChecker.js';
import { CATEGORY_TO_ROLE, ENPHASE_COMPONENT_ROLES, ROLES } from './bomRoles.js';

export const PACKAGE_STATUS = {
  PROPOSED: 'PROPOSED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
};

/** V4 lifecycle states. `PACKAGE_STATUS` above is preserved for the
 *  on-disk legacy field `approvalStatus`; PACKAGE_STATE is the V4
 *  authoritative state carried in `packageState`. */
export const PACKAGE_STATE = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  ARCHIVED: 'ARCHIVED',
};

export const APPROVAL_ERROR = {
  PACKAGE_NOT_FOUND: 'PACKAGE_NOT_FOUND',
  ALREADY_APPROVED: 'ALREADY_APPROVED',
  ALREADY_REJECTED: 'ALREADY_REJECTED',
  NOT_APPROVED_FOR_SALES: 'NOT_APPROVED_FOR_SALES',
  MISSING_REASON: 'MISSING_REASON',
  // V4 additions
  VALIDATION_MISSING: 'VALIDATION_MISSING',
  VALIDATION_STALE: 'VALIDATION_STALE',
  PACKAGE_NOT_VALID: 'PACKAGE_NOT_VALID',
  ARCHITECTURE_UNDECLARED: 'ARCHITECTURE_UNDECLARED',
  ARCHITECTURE_INVALID: 'ARCHITECTURE_INVALID',
  NOT_DRAFT_STATE: 'NOT_DRAFT_STATE',
  NOT_SUBMITTED_STATE: 'NOT_SUBMITTED_STATE',
  NOT_APPROVED_SOURCE: 'NOT_APPROVED_SOURCE',
  CANNOT_ARCHIVE_ACTIVE_APPROVED: 'CANNOT_ARCHIVE_ACTIVE_APPROVED',
  CANNOT_RESET_ARCHIVED: 'CANNOT_RESET_ARCHIVED',
  INVALID_COMPARE_COUNT: 'INVALID_COMPARE_COUNT',
  DUPLICATE_COMBO_APPROVED: 'DUPLICATE_COMBO_APPROVED',
  // B.7 (locked 2.9, 2026-09-05) — only APPROVED catalog components may
  // appear in an approved production package.
  COMPONENT_NOT_APPROVED: 'COMPONENT_NOT_APPROVED',
};

class ApprovalError extends Error {
  constructor(code, message, detail = null) {
    super(message);
    this.name = 'ApprovalError';
    this.code = code;
    this.detail = detail;
  }
}

const VALID_ARCHITECTURES = ['DEYE', 'ENPHASE'];

/**
 * Catalog packageProfiles[*].inverterType → checker architecture vocabulary.
 * This is CONFIGURED engineering data (data/catalog.json), not an inference
 * from names, brands or array positions: the profile declares whether the
 * package is a string-inverter system ('ongrid' | 'hybrid' → DEYE rules, D12)
 * or a micro-inverter system ('micro' → ENPHASE rules, D12).
 */
const PROFILE_INVERTER_TYPE_TO_ARCHITECTURE = Object.freeze({
  ongrid: 'DEYE',
  hybrid: 'DEYE',
  micro: 'ENPHASE',
});

/**
 * Resolve the engineering architecture of a package record.
 *
 *   1. An explicit, valid `pkg.architecture` always wins (PH/Admin declared).
 *   2. Otherwise the catalog profile the package is built on
 *      (`catalog.packageProfiles[pkg.profileKey].inverterType`) decides.
 *   3. Otherwise null — the checker reports PBC-A-001; nothing is guessed.
 *
 * Returns { architecture, source } where source ∈
 * 'PACKAGE_DECLARED' | 'PROFILE_INVERTER_TYPE' | null.
 */
export function resolvePackageArchitecture(pkg, catalog) {
  if (pkg && VALID_ARCHITECTURES.includes(pkg.architecture)) {
    return { architecture: pkg.architecture, source: 'PACKAGE_DECLARED' };
  }
  const profile = pkg?.profileKey && catalog?.packageProfiles
    ? catalog.packageProfiles[pkg.profileKey]
    : null;
  const mapped = profile && profile.inverterType != null
    ? PROFILE_INVERTER_TYPE_TO_ARCHITECTURE[String(profile.inverterType).toLowerCase()] ?? null
    : null;
  if (mapped) return { architecture: mapped, source: 'PROFILE_INVERTER_TYPE' };
  return { architecture: null, source: null };
}

/**
 * B.7 (locked 2.9, 2026-09-05) — Component-approval gate helper.
 *
 * Inspects each of a package's pinned components against the catalog and
 * throws COMPONENT_NOT_APPROVED if any component's catalog record does not
 * have approvalStatus === 'APPROVED'. Nothing is auto-approved; approval
 * remains an explicit Admin/Project-Head act.
 *
 * `catalog` is optional. When absent the gate is a no-op — callers that
 * cannot supply the catalog (e.g. legacy unit tests) continue to work.
 * When present, every pinned componentId in `pkg.components[].componentId`
 * must be findable in `catalog.categories[<role>].items[]` with
 * approvalStatus === 'APPROVED'.
 *
 * Never invents approval status. When a catalog item lacks the
 * `approvalStatus` field it is treated as UNKNOWN and blocks — the caller
 * must Admin-approve the catalog item first.
 */
function assertComponentsApproved(pkg, catalog) {
  if (!catalog) return; // no-op when catalog not supplied
  const comps = pkg.components || [];
  const bad = [];
  for (const comp of comps) {
    const role = comp.role;
    const cid  = comp.componentId || comp.pinnedComponentId;
    if (!role || !cid) continue;
    const cat = catalog.categories?.[role];
    if (!cat || !Array.isArray(cat.items)) continue; // no catalog category to check
    const catalogItem = cat.items.find(i => i.id === cid);
    if (!catalogItem) {
      bad.push({ role, componentId: cid, reason: 'NOT_IN_CATALOG' });
      continue;
    }
    const status = catalogItem.approvalStatus;
    if (status !== 'APPROVED') {
      bad.push({ role, componentId: cid, name: catalogItem.name || null,
                 approvalStatus: status ?? 'UNKNOWN' });
    }
  }
  if (bad.length > 0) {
    throw new ApprovalError(APPROVAL_ERROR.COMPONENT_NOT_APPROVED,
      `Package "${pkg.packageId}" cannot be approved — ${bad.length} pinned component(s) not APPROVED in catalog.`,
      { packageId: pkg.packageId, components: bad });
  }
}


/**
 * Find a package in the registry by packageId.
 */
function findPackage(registry, packageId) {
  const packages = registry?.packages || [];
  return packages.find(p => p.packageId === packageId) || null;
}

/** V4 approval-eligibility gate. Throws or returns silently. */
function assertReadyForApproval(pkg, { acknowledgeWarnings = false } = {}) {
  if (!pkg.lastValidation) {
    throw new ApprovalError(APPROVAL_ERROR.VALIDATION_MISSING,
      `Package "${pkg.packageId}" has no engineering validation. Run the checker before approval.`,
      { packageId: pkg.packageId });
  }
  const revision = pkg.revisionNumber ?? 1;
  if (pkg.lastValidation.revisionNumber !== revision) {
    throw new ApprovalError(APPROVAL_ERROR.VALIDATION_STALE,
      `Validation on package "${pkg.packageId}" is for revision ${pkg.lastValidation.revisionNumber} but the package is at revision ${revision}.`,
      { packageId: pkg.packageId, validatedRevision: pkg.lastValidation.revisionNumber, currentRevision: revision });
  }
  const okStatus = pkg.lastValidation.status === 'VALID' || (acknowledgeWarnings && pkg.lastValidation.status === 'WARNING');
  if (!okStatus) {
    throw new ApprovalError(APPROVAL_ERROR.PACKAGE_NOT_VALID,
      `Package "${pkg.packageId}" cannot be approved — validation status is ${pkg.lastValidation.status}.`,
      { packageId: pkg.packageId, validationStatus: pkg.lastValidation.status });
  }
}

/**
 * comboKey = systemType|size|phase|tier (locked). A FUTURE_READY pack is a
 * distinct combo: `…|FR<systemSize>` is appended so it never supersedes the
 * standard pack of the same panel size.
 */
export function comboKeyFor({ systemType, size, phase, tier, variant = null, systemSize = null }) {
  const base = `${systemType ?? ''}|${size ?? ''}|${phase ?? ''}|${tier ?? ''}`;
  return variant === 'FUTURE_READY' && systemSize ? `${base}|FR${systemSize}` : base;
}
function comboKeyOf(pkg) {
  return pkg.comboKey ?? comboKeyFor(pkg);
}

/**
 * Approve a package. Requires PACKAGE_APPROVE (ADMIN-only in V4).
 * V4 gate: a fresh, matching-revision VALID validation must be present.
 * Sets approvalStatus/APPROVED and cascades to component approval;
 * additionally sets packageState=APPROVED and supersedes any prior
 * APPROVED revision sharing the same comboKey.
 */
export function approvePackage(registry, { actor, packageId, notes, at, catalog, acknowledgeWarnings = false }) {
  assertCan(actor, CAPABILITY.PACKAGE_APPROVE);
  if (!at) throw new ApprovalError('MISSING_TIMESTAMP', 'Timestamp (at) is required.');

  const pkg = findPackage(registry, packageId);
  if (!pkg) throw new ApprovalError(APPROVAL_ERROR.PACKAGE_NOT_FOUND,
    `Package "${packageId}" not found.`, { packageId });

  const alreadyApproved = pkg.packageState === PACKAGE_STATE.APPROVED
    || pkg.approvalStatus === PACKAGE_STATUS.APPROVED;
  if (alreadyApproved) {
    throw new ApprovalError(APPROVAL_ERROR.ALREADY_APPROVED,
      `Package "${packageId}" is already APPROVED.`, { packageId });
  }

  // V4 three-check gate: presence + freshness + status.
  // WARNING-status validation may be approved ONLY with an explicit
  // acknowledgement; the acknowledged rule ids are recorded on the package.
  // BLOCKED is never approvable.
  assertReadyForApproval(pkg, { acknowledgeWarnings });
  if (pkg.lastValidation?.status === 'WARNING') {
    pkg.acknowledgedWarnings = (pkg.lastValidation.findings || []).filter(f => f.severity === 'WARNING')
      .map(f => ({ ruleId: f.ruleId, acknowledgedBy: actor.userId, acknowledgedAt: at }));
  }

  // B.7 (locked 2.9, 2026-09-05) — component-approval gate.
  // No-op when catalog not supplied (backwards-compat with existing callers/tests).
  // Servers that resolve the catalog pass it in; production path must supply.
  assertComponentsApproved(pkg, catalog);

  pkg.approvalStatus = PACKAGE_STATUS.APPROVED;
  pkg.approvedBy = actor.userId;
  pkg.approvedAt = at;
  pkg.approvalNotes = notes || null;
  pkg.engineeringStatus = 'APPROVED';
  pkg.packageState = PACKAGE_STATE.APPROVED;

  // Mark all components as approved by this action
  for (const comp of (pkg.components || [])) {
    if (comp.approvalStatus !== 'APPROVED') {
      comp.approvalStatus = 'APPROVED';
      comp.approvedByDecision = `PKG_APPROVAL_${actor.userId}_${at}`;
    }
  }

  // Supersede prior APPROVED-not-superseded revisions with the same comboKey.
  const combo = comboKeyOf(pkg);
  for (const p of (registry.packages || [])) {
    if (p.packageId === pkg.packageId) continue;
    const pCombo = comboKeyOf(p);
    if (pCombo !== combo) continue;
    if (p.packageState !== PACKAGE_STATE.APPROVED) continue;
    if (p.supersededBy) continue;
    if (p.packageState === PACKAGE_STATE.ARCHIVED) continue;
    p.supersededBy = pkg.packageId;
  }

  return {
    packageId,
    approvalStatus: PACKAGE_STATUS.APPROVED,
    approvedBy: actor.userId,
    approvedAt: at,
    componentCount: (pkg.components || []).length,
  };
}

/**
 * Reject a package. Requires PACKAGE_APPROVE. reason is mandatory.
 */
export function rejectPackage(registry, { actor, packageId, reason, at }) {
  assertCan(actor, CAPABILITY.PACKAGE_APPROVE);
  if (!at) throw new ApprovalError('MISSING_TIMESTAMP', 'Timestamp (at) is required.');
  if (!reason || !reason.trim()) {
    throw new ApprovalError(APPROVAL_ERROR.MISSING_REASON,
      'A reason is required when rejecting a package.', { packageId });
  }

  const pkg = findPackage(registry, packageId);
  if (!pkg) throw new ApprovalError(APPROVAL_ERROR.PACKAGE_NOT_FOUND,
    `Package "${packageId}" not found.`, { packageId });

  pkg.approvalStatus = PACKAGE_STATUS.REJECTED;
  pkg.rejectedBy = actor.userId;
  pkg.rejectedAt = at;
  pkg.rejectionReason = reason.trim();
  pkg.engineeringStatus = 'REJECTED';
  pkg.packageState = PACKAGE_STATE.REJECTED;

  return {
    packageId,
    approvalStatus: PACKAGE_STATUS.REJECTED,
    rejectedBy: actor.userId,
    rejectedAt: at,
    reason: reason.trim(),
  };
}

/**
 * Reset a package back to DRAFT (V4) / PROPOSED (legacy field).
 * Requires PACKAGE_APPROVE. Refuses to reset an ARCHIVED record.
 * Fresh reset clears any prior validation — a new checker run is required.
 */
export function resetPackage(registry, { actor, packageId, at }) {
  assertCan(actor, CAPABILITY.PACKAGE_APPROVE);
  if (!at) throw new ApprovalError('MISSING_TIMESTAMP', 'Timestamp (at) is required.');

  const pkg = findPackage(registry, packageId);
  if (!pkg) throw new ApprovalError(APPROVAL_ERROR.PACKAGE_NOT_FOUND,
    `Package "${packageId}" not found.`, { packageId });

  if (pkg.packageState === PACKAGE_STATE.ARCHIVED) {
    throw new ApprovalError(APPROVAL_ERROR.CANNOT_RESET_ARCHIVED,
      `Package "${packageId}" is ARCHIVED and cannot be reset.`, { packageId });
  }

  pkg.approvalStatus = PACKAGE_STATUS.PROPOSED;
  pkg.approvedBy = null;
  pkg.approvedAt = null;
  pkg.rejectedBy = null;
  pkg.rejectedAt = null;
  pkg.rejectionReason = null;
  pkg.approvalNotes = null;
  pkg.engineeringStatus = 'WARNING';
  pkg.packageState = PACKAGE_STATE.DRAFT;
  pkg.lastValidation = null;

  // Reset component approval status where it was set by package approval
  for (const comp of (pkg.components || [])) {
    if (comp.approvedByDecision && comp.approvedByDecision.startsWith('PKG_APPROVAL_')) {
      comp.approvalStatus = 'PROPOSED';
      comp.approvedByDecision = null;
    }
  }

  return { packageId, approvalStatus: PACKAGE_STATUS.PROPOSED };
}

/**
 * Bulk approve all packages matching a filter.
 * The V4 approval gate lives in `approvePackage`; this method only
 * dispatches — it never re-implements the gate. Errored packages are
 * returned per-item, letting the caller distinguish which ones failed
 * validation from which succeeded.
 */
export function bulkApprovePackages(registry, { actor, filter, notes, at, catalog }) {
  assertCan(actor, CAPABILITY.PACKAGE_APPROVE);
  if (!at) throw new ApprovalError('MISSING_TIMESTAMP', 'Timestamp (at) is required.');

  const packages = registry?.packages || [];
  const targets = packages.filter(p => {
    if (p.packageState === PACKAGE_STATE.APPROVED) return false;
    if (p.approvalStatus === PACKAGE_STATUS.APPROVED) return false;
    if (filter?.systemType && p.systemType !== filter.systemType) return false;
    if (filter?.tier && p.tier !== filter.tier) return false;
    if (filter?.phase && p.phase !== filter.phase) return false;
    if (filter?.size && p.size !== filter.size) return false;
    return true;
  });

  const results = [];
  for (const pkg of targets) {
    try {
      const result = approvePackage(registry, { actor, packageId: pkg.packageId, notes, at, catalog });
      results.push(result);
    } catch (e) {
      results.push({ packageId: pkg.packageId, error: e.message, code: e.code || null });
    }
  }
  return { approved: results.filter(r => !r.error), errors: results.filter(r => r.error), total: targets.length };
}

/**
 * List packages visible to an actor.
 * Sales roles see only APPROVED packages (the runtime-visible slice is
 * enforced upstream in server-workspace.buildEnv via visibleForRuntime;
 * this list is used by the Admin/PH UIs and applies filter fields).
 */
export function listPackagesForRole(registry, { actor, filter }) {
  const packages = registry?.packages || [];
  const isSales = isIndividualSalesRole(actor?.role) || actor?.role === ROLE.SALES_HEAD;

  let result = packages;

  // Sales sees only APPROVED packages
  if (isSales) {
    result = result.filter(p => p.approvalStatus === PACKAGE_STATUS.APPROVED);
  }

  // Apply optional filters
  if (filter?.systemType) result = result.filter(p => p.systemType === filter.systemType);
  if (filter?.tier) result = result.filter(p => p.tier === filter.tier);
  if (filter?.phase) result = result.filter(p => p.phase === filter.phase);
  if (filter?.size) result = result.filter(p => p.size === filter.size);
  if (filter?.approvalStatus) result = result.filter(p => p.approvalStatus === filter.approvalStatus);
  if (filter?.packageState) result = result.filter(p => p.packageState === filter.packageState);

  return result.map(p => ({
    packageId: p.packageId,
    systemType: p.systemType,
    size: p.size,
    phase: p.phase,
    tier: p.tier,
    profileKey: p.profileKey,
    approvalStatus: p.approvalStatus,
    approvedBy: p.approvedBy || null,
    approvedAt: p.approvedAt || null,
    engineeringStatus: p.engineeringStatus,
    componentCount: (p.components || []).length,
    approvedComponentCount: (p.components || []).filter(c => c.approvalStatus === 'APPROVED').length,
    // V4 additions
    packageState: p.packageState ?? null,
    revisionNumber: p.revisionNumber ?? 1,
    comboKey: p.comboKey ?? null,
    // 2026-09-08 pack publish
    variant: p.variant ?? 'STANDARD',
    systemSize: p.systemSize ?? p.size,
    publishedFromConfigVersion: p.publishedFromConfigVersion ?? null,
    supersededBy: p.supersededBy ?? null,
    architecture: p.architecture ?? null,
    lastValidationStatus: p.lastValidation?.status ?? null,
    createdBy: p.createdBy ?? null,
    createdAt: p.createdAt ?? null,
    submittedBy: p.submittedBy ?? null,
    submittedAt: p.submittedAt ?? null,
  }));
}

/**
 * Approval summary for dashboard display.
 */
export function approvalSummary(registry) {
  const packages = registry?.packages || [];
  return {
    total: packages.length,
    approved: packages.filter(p => p.approvalStatus === PACKAGE_STATUS.APPROVED).length,
    proposed: packages.filter(p => p.approvalStatus === PACKAGE_STATUS.PROPOSED).length,
    rejected: packages.filter(p => p.approvalStatus === PACKAGE_STATUS.REJECTED).length,
  };
}

/**
 * ENFORCEMENT GATE — called before Sales can select a package.
 * Returns true if the package is selectable by this actor,
 * throws if Sales tries to use a non-APPROVED package.
 */
export function assertPackageSelectableByActor(registry, { actor, packageId }) {
  const isSales = isIndividualSalesRole(actor?.role) || actor?.role === ROLE.SALES_HEAD;
  if (!isSales) return true; // Non-sales roles can select any package

  const pkg = findPackage(registry, packageId);
  if (!pkg) throw new ApprovalError(APPROVAL_ERROR.PACKAGE_NOT_FOUND,
    `Package "${packageId}" not found.`, { packageId });

  if (pkg.approvalStatus !== PACKAGE_STATUS.APPROVED) {
    throw new ApprovalError(APPROVAL_ERROR.NOT_APPROVED_FOR_SALES,
      `Package "${packageId}" is ${pkg.approvalStatus}. Only APPROVED packages are available for Sales.`,
      { packageId, approvalStatus: pkg.approvalStatus });
  }
  return true;
}

// =========================================================================
// V4 AUTHORING METHODS
// =========================================================================

let _idSeq = 0;
function generatePackageId(template) {
  const systemType = String(template.systemType || 'PKG').toUpperCase();
  const size = String(template.size || '');
  const phase = String(template.phase || '').toUpperCase();
  const tier = String(template.tier || '').toUpperCase();
  const fr = template.variant === 'FUTURE_READY' && template.systemSize ? `-FR${template.systemSize}` : '';
  // ms stamp + in-process sequence: two ids generated in the same millisecond never collide.
  const stamp = Date.now().toString(36) + (_idSeq++ % 1296).toString(36).padStart(2, '0');
  return `CFGPKG-${systemType}-${size}-${phase}-${tier}${fr}-${stamp}`;
}

function deepCopy(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

/**
 * Create a new package as a DRAFT. Requires PACKAGE_CREATE (PROJECT_HEAD).
 */
export function createPackage(registry, { actor, template, at }) {
  assertCan(actor, CAPABILITY.PACKAGE_CREATE);
  if (!at) throw new ApprovalError('MISSING_TIMESTAMP', 'Timestamp (at) is required.');
  if (!template || typeof template !== 'object') {
    throw new ApprovalError('MISSING_TEMPLATE', 'A package template object is required.');
  }
  const required = ['systemType', 'size', 'phase', 'tier', 'architecture', 'profileKey', 'components'];
  for (const key of required) {
    if (template[key] == null) {
      throw new ApprovalError('MISSING_TEMPLATE_FIELD',
        `Template is missing required field "${key}".`, { field: key });
    }
  }
  if (!Array.isArray(template.components)) {
    throw new ApprovalError('MISSING_TEMPLATE_FIELD',
      'Template components must be an array.', { field: 'components' });
  }
  if (!VALID_ARCHITECTURES.includes(template.architecture)) {
    throw new ApprovalError(APPROVAL_ERROR.ARCHITECTURE_INVALID,
      `Architecture "${template.architecture}" is not one of ${VALID_ARCHITECTURES.join(', ')}.`,
      { architecture: template.architecture });
  }

  const packageId = template.packageId || generatePackageId(template);
  const comboKey = comboKeyFor(template);

  const record = {
    packageId,
    systemType: template.systemType,
    size: template.size,
    phase: template.phase,
    tier: template.tier,
    profileKey: template.profileKey,
    architecture: template.architecture,
    upgradePathId: template.upgradePathId ?? null,
    fromSize: template.fromSize ?? null,
    toSize: template.toSize ?? null,
    // Future Ready (owner Q7): panels sized for `size`, everything else for `systemSize`.
    variant: template.variant ?? 'STANDARD',
    systemSize: template.systemSize ?? template.size,
    packageState: PACKAGE_STATE.DRAFT,
    revisionNumber: 1,
    comboKey,
    supersededBy: null,
    approvalStatus: PACKAGE_STATUS.PROPOSED,
    engineeringStatus: 'WARNING',
    approvedBy: null,
    approvedAt: null,
    approvalNotes: null,
    rejectedBy: null,
    rejectedAt: null,
    rejectionReason: null,
    createdBy: actor.userId,
    createdAt: at,
    submittedBy: null,
    submittedAt: null,
    archivedBy: null,
    archivedAt: null,
    archivalReason: null,
    lastValidation: null,
    legacyApproved: false,
    blockers: [],
    approvedRules: [],
    prohibited: [],
    components: deepCopy(template.components),
  };

  if (!Array.isArray(registry.packages)) registry.packages = [];
  registry.packages.push(record);
  return { packageId, package: record };
}

/**
 * Duplicate an existing package as a new DRAFT. Approval metadata is
 * stripped; the caller gets a clean slate that inherits only the design.
 */
export function duplicatePackage(registry, { actor, sourcePackageId, at }) {
  assertCan(actor, CAPABILITY.PACKAGE_DUPLICATE);
  if (!at) throw new ApprovalError('MISSING_TIMESTAMP', 'Timestamp (at) is required.');

  const source = findPackage(registry, sourcePackageId);
  if (!source) throw new ApprovalError(APPROVAL_ERROR.PACKAGE_NOT_FOUND,
    `Package "${sourcePackageId}" not found.`, { packageId: sourcePackageId });

  const copy = deepCopy(source);
  const packageId = generatePackageId(source);
  copy.packageId = packageId;
  copy.packageState = PACKAGE_STATE.DRAFT;
  copy.revisionNumber = 1;
  copy.supersededBy = null;
  copy.approvalStatus = PACKAGE_STATUS.PROPOSED;
  copy.engineeringStatus = 'WARNING';
  copy.approvedBy = null;
  copy.approvedAt = null;
  copy.approvalNotes = null;
  copy.rejectedBy = null;
  copy.rejectedAt = null;
  copy.rejectionReason = null;
  copy.archivedBy = null;
  copy.archivedAt = null;
  copy.archivalReason = null;
  copy.submittedBy = null;
  copy.submittedAt = null;
  copy.createdBy = actor.userId;
  copy.createdAt = at;
  copy.lastValidation = null;
  copy.legacyApproved = false;
  copy.comboKey = `${copy.systemType ?? ''}|${copy.size ?? ''}|${copy.phase ?? ''}|${copy.tier ?? ''}`;
  copy.architecture = source.architecture ?? null;

  registry.packages.push(copy);
  return { packageId, package: copy };
}

/**
 * Create a new revision of an APPROVED, non-superseded package.
 * Source is NOT mutated; the new record shares the comboKey and receives
 * revisionNumber = source + 1. Approving the revision later will
 * supersede the source (automatic, via approvePackage).
 */
export function createRevision(registry, { actor, sourcePackageId, at }) {
  assertCan(actor, CAPABILITY.PACKAGE_EDIT);
  if (!at) throw new ApprovalError('MISSING_TIMESTAMP', 'Timestamp (at) is required.');

  const source = findPackage(registry, sourcePackageId);
  if (!source) throw new ApprovalError(APPROVAL_ERROR.PACKAGE_NOT_FOUND,
    `Package "${sourcePackageId}" not found.`, { packageId: sourcePackageId });

  if (source.packageState !== PACKAGE_STATE.APPROVED || source.supersededBy) {
    throw new ApprovalError(APPROVAL_ERROR.NOT_APPROVED_SOURCE,
      `Cannot revise "${sourcePackageId}" — it is not an APPROVED, non-superseded record.`,
      { packageId: sourcePackageId, packageState: source.packageState, supersededBy: source.supersededBy });
  }

  const copy = deepCopy(source);
  const packageId = generatePackageId(source);
  copy.packageId = packageId;
  copy.revisionNumber = (source.revisionNumber || 1) + 1;
  copy.comboKey = source.comboKey ?? `${source.systemType ?? ''}|${source.size ?? ''}|${source.phase ?? ''}|${source.tier ?? ''}`;
  copy.packageState = PACKAGE_STATE.DRAFT;
  copy.supersededBy = null;
  copy.approvalStatus = PACKAGE_STATUS.PROPOSED;
  copy.engineeringStatus = 'WARNING';
  copy.approvedBy = null;
  copy.approvedAt = null;
  copy.approvalNotes = null;
  copy.rejectedBy = null;
  copy.rejectedAt = null;
  copy.rejectionReason = null;
  copy.createdBy = actor.userId;
  copy.createdAt = at;
  copy.submittedBy = null;
  copy.submittedAt = null;
  copy.archivedBy = null;
  copy.archivedAt = null;
  copy.archivalReason = null;
  copy.lastValidation = null;
  copy.legacyApproved = false;
  copy.architecture = source.architecture ?? null;

  registry.packages.push(copy);
  return { packageId, package: copy };
}

const EDITABLE_FIELDS = new Set(['architecture', 'components', 'profileKey']);

/**
 * Edit a DRAFT package. Only architecture / components / profileKey may
 * be patched. Any edit invalidates the last validation.
 */
export function editPackage(registry, { actor, packageId, patch, at }) {
  assertCan(actor, CAPABILITY.PACKAGE_EDIT);
  if (!at) throw new ApprovalError('MISSING_TIMESTAMP', 'Timestamp (at) is required.');

  const pkg = findPackage(registry, packageId);
  if (!pkg) throw new ApprovalError(APPROVAL_ERROR.PACKAGE_NOT_FOUND,
    `Package "${packageId}" not found.`, { packageId });

  if (pkg.packageState !== PACKAGE_STATE.DRAFT) {
    throw new ApprovalError(APPROVAL_ERROR.NOT_DRAFT_STATE,
      `Package "${packageId}" is ${pkg.packageState}; only DRAFT packages may be edited.`,
      { packageId, packageState: pkg.packageState });
  }

  const changes = patch && typeof patch === 'object' ? patch : {};
  for (const key of Object.keys(changes)) {
    if (!EDITABLE_FIELDS.has(key)) {
      throw new ApprovalError('IMMUTABLE_FIELD',
        `Field "${key}" is not editable on a DRAFT package.`, { field: key });
    }
  }

  if (Object.prototype.hasOwnProperty.call(changes, 'architecture')) {
    if (!VALID_ARCHITECTURES.includes(changes.architecture)) {
      throw new ApprovalError(APPROVAL_ERROR.ARCHITECTURE_INVALID,
        `Architecture "${changes.architecture}" is not one of ${VALID_ARCHITECTURES.join(', ')}.`,
        { architecture: changes.architecture });
    }
    pkg.architecture = changes.architecture;
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'components')) {
    if (!Array.isArray(changes.components)) {
      throw new ApprovalError('IMMUTABLE_FIELD',
        'components must be an array.', { field: 'components' });
    }
    pkg.components = deepCopy(changes.components);
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'profileKey')) {
    pkg.profileKey = changes.profileKey;
  }

  pkg.lastValidation = null;

  return { packageId, package: pkg };
}

/**
 * Submit a DRAFT for approval. V4 gate identical to approve: fresh,
 * matching-revision VALID validation is required.
 */
export function submitPackage(registry, { actor, packageId, at, acknowledgeWarnings = false }) {
  assertCan(actor, CAPABILITY.PACKAGE_SUBMIT);
  if (!at) throw new ApprovalError('MISSING_TIMESTAMP', 'Timestamp (at) is required.');

  const pkg = findPackage(registry, packageId);
  if (!pkg) throw new ApprovalError(APPROVAL_ERROR.PACKAGE_NOT_FOUND,
    `Package "${packageId}" not found.`, { packageId });

  if (pkg.packageState !== PACKAGE_STATE.DRAFT) {
    throw new ApprovalError(APPROVAL_ERROR.NOT_DRAFT_STATE,
      `Package "${packageId}" is ${pkg.packageState}; only DRAFT packages may be submitted.`,
      { packageId, packageState: pkg.packageState });
  }

  assertReadyForApproval(pkg, { acknowledgeWarnings });

  pkg.packageState = PACKAGE_STATE.SUBMITTED;
  pkg.submittedBy = actor.userId;
  pkg.submittedAt = at;

  return { packageId, packageState: PACKAGE_STATE.SUBMITTED, submittedBy: actor.userId, submittedAt: at };
}

/**
 * Archive a package. Refuses active APPROVED records — the caller must
 * first supersede or reject them.
 */
export function archivePackage(registry, { actor, packageId, reason, at }) {
  assertCan(actor, CAPABILITY.PACKAGE_ARCHIVE);
  if (!at) throw new ApprovalError('MISSING_TIMESTAMP', 'Timestamp (at) is required.');
  if (!reason || !String(reason).trim()) {
    throw new ApprovalError(APPROVAL_ERROR.MISSING_REASON,
      'A reason is required when archiving a package.', { packageId });
  }

  const pkg = findPackage(registry, packageId);
  if (!pkg) throw new ApprovalError(APPROVAL_ERROR.PACKAGE_NOT_FOUND,
    `Package "${packageId}" not found.`, { packageId });

  if (pkg.packageState === PACKAGE_STATE.APPROVED && !pkg.supersededBy) {
    throw new ApprovalError(APPROVAL_ERROR.CANNOT_ARCHIVE_ACTIVE_APPROVED,
      `Package "${packageId}" is an active APPROVED record and cannot be archived until it is superseded or rejected.`,
      { packageId });
  }

  pkg.packageState = PACKAGE_STATE.ARCHIVED;
  pkg.archivedBy = actor.userId;
  pkg.archivedAt = at;
  pkg.archivalReason = String(reason).trim();

  return { packageId, packageState: PACKAGE_STATE.ARCHIVED, archivedBy: actor.userId, archivedAt: at };
}

/** Map a registry-record component `role` string to the canonical
 *  checker role. The registry uses lowercase categorical roles like
 *  'panel','inverter','battery','isolator', etc. */
function mapRegistryRoleToCheckerRole(comp) {
  if (!comp) return ROLES.OTHER;
  const componentId = comp.componentId || null;
  if (componentId && ENPHASE_COMPONENT_ROLES[componentId]) return ENPHASE_COMPONENT_ROLES[componentId];
  const cat = comp.role;
  if (cat && CATEGORY_TO_ROLE[cat]) return CATEGORY_TO_ROLE[cat];
  return ROLES.OTHER;
}

/**
 * Run the engineering checker against a package. Writes the result to
 * `pkg.lastValidation` (with the current revisionNumber pinned).
 * Requires BOM_RUN_CHECKER (held by PROJECT_HEAD, ENGINEERING, ADMIN).
 */
export function runPackageChecker(registry, env, { actor, packageId, at }) {
  assertCan(actor, CAPABILITY.BOM_RUN_CHECKER);
  if (!at) throw new ApprovalError('MISSING_TIMESTAMP', 'Timestamp (at) is required.');

  const pkg = findPackage(registry, packageId);
  if (!pkg) throw new ApprovalError(APPROVAL_ERROR.PACKAGE_NOT_FOUND,
    `Package "${packageId}" not found.`, { packageId });

  if (pkg.architecture != null && !VALID_ARCHITECTURES.includes(pkg.architecture)) {
    throw new ApprovalError(APPROVAL_ERROR.ARCHITECTURE_INVALID,
      `Architecture "${pkg.architecture}" is not one of ${VALID_ARCHITECTURES.join(', ')}.`,
      { architecture: pkg.architecture });
  }
  // Legacy packages (all 53 in packages.proposed.json) carry architecture: null.
  // Resolve from the catalog profile's configured inverterType; refuse only
  // when neither the package nor its profile states it.
  const resolved = resolvePackageArchitecture(pkg, env?.catalog);
  if (!resolved.architecture) {
    throw new ApprovalError(APPROVAL_ERROR.ARCHITECTURE_UNDECLARED,
      `Package "${packageId}" has no architecture declared and its profile "${pkg.profileKey}" declares no inverterType; the checker cannot run.`,
      { packageId, profileKey: pkg.profileKey ?? null });
  }
  const architecture = resolved.architecture;

  const components = Array.isArray(pkg.components) ? pkg.components : [];
  const lines = components
    .map(c => ({
      role: mapRegistryRoleToCheckerRole(c),
      componentId: c.componentId,
      quantity: c.quantity,
    }))
    .sort((a, b) => String(a.role).localeCompare(String(b.role)));

  // checkProjectBom reads phase/architecture from `bom` and — when `lines` is
  // supplied — validates exactly those lines (a package template has no
  // project-level overrides/removals). Passing the lines only inside `bom`
  // made the checker fall through to effectiveLinesOf(bom) and crash on the
  // missing packageLines/overrides/removedRoles (latent since V4; never
  // reached before because ARCHITECTURE_UNDECLARED fired first).
  // sysType rides along so system-scoped rules (PBC-M-003: System Controller
  // is a backup part — hybrid only) can tell an on-grid pack from a hybrid one.
  const bom = { phase: pkg.phase, architecture, sysType: pkg.systemType ?? null, lines };

  const validation = checkProjectBom({
    bom,
    lines,
    // Package = template scope: structure is site-level (roof type) and is
    // added per project; its presence is not a template rule.
    templateScope: true,
    catalog: env?.catalog || { categories: {} },
    batteryMaster: env?.batteryMaster || {},
    at,
    catalogVersion: env?.catalogVersion ?? null,
    upgrade: null,
    futureUpgrade: false,
  });

  const revisionNumber = pkg.revisionNumber || 1;
  pkg.lastValidation = { ...validation, revisionNumber, architecture, architectureSource: resolved.source };

  return pkg.lastValidation;
}
