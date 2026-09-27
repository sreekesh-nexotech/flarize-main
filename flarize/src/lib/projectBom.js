/**
 * PROJECT BOM WORKSPACE.  (Phase 1E §1–§3, §5)
 *
 * GOVERNING PRINCIPLE
 *   The Project Head is the AUTHORITY for what is in the project BOM.
 *   The Engineering Checker is the AUTHORITY for whether it is valid.
 *   These are separate concerns and this module implements only the first.
 *
 * Consequences, enforced here:
 *   - `setComponent` NEVER validates, never filters, never rejects a component
 *     for engineering reasons. A component with incomplete or bad data may be
 *     selected. The checker decides what that means.
 *   - Nothing is ever silently removed, substituted, zeroed or replaced. There
 *     is no code path in this module that swaps one componentId for another.
 *   - A line only leaves the BOM when the Project Head explicitly removes it.
 *
 * BOUNDARY: selection and quantity. No validation, no pricing, no presentation.
 */

import { ROLES } from './bomRoles.js';
import { SELECTION_METHOD } from './projectConfiguration.js';

export const PROJECT_BOM_STATUS = { DRAFT: 'DRAFT', LOCKED: 'LOCKED' };

/**
 * Roles a Project Head may select or change (brief §1).
 * DC_ISOLATOR is absent: decision D11-C, not modelled in V1.
 */
export const PROJECT_EDITABLE_ROLES = [
  ROLES.PANEL, ROLES.INVERTER, ROLES.MICRO_INVERTER, ROLES.BATTERY,
  ROLES.STRUCTURE, ROLES.ACDB, ROLES.DCDB, ROLES.AC_ISOLATOR, ROLES.CHANGEOVER,
  ROLES.AC_CABLE, ROLES.DC_CABLE, ROLES.BATTERY_PROTECTION, ROLES.BATTERY_CABLE,
  ROLES.MONITORING, ROLES.EARTHING, ROLES.PROTECTION,
  ROLES.ENERGY_SYSTEM_CONTROLLER, ROLES.ENPHASE_COMMUNICATION, ROLES.METER,
  ROLES.OTHER,
];

export function isProjectEditableRole(role) {
  return PROJECT_EDITABLE_ROLES.includes(role);
}

/**
 * Build a project BOM from a package default.
 *
 * @param {object} arg
 *   projectId, packageId
 *   architecture   'DEYE' | 'ENPHASE' | null
 *   sysType, tier, sizeKw, phase
 *   lines          [{ role, componentId, quantity }]  — the package default
 */
export function createProjectBom({
  projectId, packageId, architecture = null,
  sysType = null, tier = null, sizeKw = null, phase = null,
  lines = [], createdBy = null, createdAt = null,
}) {
  const packageLines = lines.map(l => Object.freeze({
    role: l.role,
    componentId: l.componentId ?? null,
    quantity: l.quantity ?? 0,
    selectionMethod: SELECTION_METHOD.PACKAGE_DEFAULT,
    selectedBy: null,
    selectionTimestamp: null,
    reason: null,
  }));
  return Object.freeze({
    projectId, packageId, architecture, sysType, tier, sizeKw, phase,
    status: PROJECT_BOM_STATUS.DRAFT,
    createdBy, createdAt,
    /** The package default, frozen. A project edit NEVER writes here. */
    packageLines: Object.freeze(packageLines),
    /** Project-level edits, keyed by role. */
    overrides: Object.freeze({}),
    /** Roles the Project Head explicitly removed. */
    removedRoles: Object.freeze([]),
    history: Object.freeze([]),
    lock: null,
  });
}

/** Reject a mutation of a locked BOM. */
function assertEditable(bom, what) {
  if (!bom) throw new Error('no project BOM');
  if (bom.status === PROJECT_BOM_STATUS.LOCKED)
    throw new Error(`Project BOM ${bom.projectId} is LOCKED and cannot be ${what}. Revise the snapshot instead.`);
}

/**
 * Project Head selects a component for a role.
 *
 * This function performs NO engineering validation, by design. An incompatible
 * or under-specified component is accepted and stays visible in the BOM; the
 * Engineering Checker reports it as WARNING or BLOCKED.
 */
export function setComponent(bom, { role, componentId, quantity, selectedBy = null, at = null, reason = null, method = SELECTION_METHOD.PROJECT_HEAD_OVERRIDE }) {
  assertEditable(bom, 'edited');
  if (!role) throw new Error('role is required');
  if (!isProjectEditableRole(role)) throw new Error(`role "${role}" is not a project-editable role`);
  if (componentId == null) throw new Error('componentId is required — use removeRole() to remove a line explicitly');

  const prev = effectiveLine(bom, role);
  const entry = Object.freeze({
    role,
    componentId,
    quantity: quantity != null ? quantity : (prev?.quantity ?? 0),
    selectionMethod: method,
    selectedBy,
    selectionTimestamp: at,
    reason,
  });
  return Object.freeze({
    ...bom,
    packageLines: bom.packageLines,                 // untouched — the package is global
    overrides: Object.freeze({ ...bom.overrides, [role]: entry }),
    removedRoles: Object.freeze(bom.removedRoles.filter(r => r !== role)),
    history: Object.freeze([...bom.history, Object.freeze({
      action: 'SET_COMPONENT', role, from: prev?.componentId ?? null, to: componentId,
      by: selectedBy, at, reason,
    })]),
  });
}

/** Change quantity only. Identity untouched. */
export function setQuantity(bom, { role, quantity, selectedBy = null, at = null }) {
  assertEditable(bom, 'edited');
  const prev = effectiveLine(bom, role);
  if (!prev) throw new Error(`role "${role}" is not present in the BOM`);
  return setComponent(bom, { role, componentId: prev.componentId, quantity, selectedBy, at,
    reason: 'quantity change' });
}

/**
 * EXPLICIT removal by the Project Head. The only way a line leaves the BOM.
 * Never called by validation, never called automatically.
 */
export function removeRole(bom, { role, selectedBy = null, at = null, reason = null }) {
  assertEditable(bom, 'edited');
  const prev = effectiveLine(bom, role);
  const overrides = { ...bom.overrides };
  delete overrides[role];
  return Object.freeze({
    ...bom,
    overrides: Object.freeze(overrides),
    removedRoles: Object.freeze([...new Set([...bom.removedRoles, role])]),
    history: Object.freeze([...bom.history, Object.freeze({
      action: 'REMOVE_ROLE', role, from: prev?.componentId ?? null, to: null,
      by: selectedBy, at, reason,
    })]),
  });
}

/** The effective line for one role: project override, else package default. */
export function effectiveLine(bom, role) {
  if (!bom) return null;
  if (bom.removedRoles.includes(role)) return null;
  if (bom.overrides[role]) return bom.overrides[role];
  return bom.packageLines.find(l => l.role === role) || null;
}

/**
 * Every effective line, deterministically ordered by role.
 * Ordering does not depend on insertion order, UI state or dropdown order.
 */
export function effectiveLines(bom) {
  const roles = new Set([
    ...bom.packageLines.map(l => l.role),
    ...Object.keys(bom.overrides),
  ]);
  return [...roles]
    .filter(r => !bom.removedRoles.includes(r))
    .sort()
    .map(r => effectiveLine(bom, r))
    .filter(Boolean);
}

/** Which roles the project changed, and from what to what. */
export function diffAgainstPackage(bom) {
  const out = [];
  for (const role of Object.keys(bom.overrides).sort()) {
    const pkg = bom.packageLines.find(l => l.role === role) || null;
    const ovr = bom.overrides[role];
    if (!pkg || pkg.componentId !== ovr.componentId || pkg.quantity !== ovr.quantity)
      out.push({ role, packageComponentId: pkg?.componentId ?? null, projectComponentId: ovr.componentId,
                 packageQuantity: pkg?.quantity ?? null, projectQuantity: ovr.quantity,
                 selectedBy: ovr.selectedBy, at: ovr.selectionTimestamp });
  }
  for (const role of [...bom.removedRoles].sort()) {
    const pkg = bom.packageLines.find(l => l.role === role);
    if (pkg) out.push({ role, packageComponentId: pkg.componentId, projectComponentId: null,
                        packageQuantity: pkg.quantity, projectQuantity: 0, removed: true });
  }
  return out;
}
