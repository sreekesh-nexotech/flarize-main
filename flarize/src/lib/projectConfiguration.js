/**
 * PACKAGE DEFAULT vs PROJECT OVERRIDE.  (Phase 1D §7)
 *
 * PACKAGE  — the default approved engineering configuration. Global.
 * PROJECT  — the configuration actually selected for one project. Local.
 *
 * A Project Head changing the battery on Project A must NEVER modify the
 * global package. Project B must still start from the package default.
 *
 * BOUNDARY: which component is selected and by whom. No pricing, no validation.
 */

export const SELECTION_METHOD = {
  PACKAGE_DEFAULT: 'PACKAGE_DEFAULT',
  PROJECT_HEAD_OVERRIDE: 'PROJECT_HEAD_OVERRIDE',
  ENGINEER_PROPOSAL: 'ENGINEER_PROPOSAL',
  PROCUREMENT_SUBSTITUTION: 'PROCUREMENT_SUBSTITUTION',
  FALLBACK: 'FALLBACK',
};

/** Roles Sales may never change (engineering-critical). */
export const SALES_IMMUTABLE_ROLES = [
  'BATTERY', 'BATTERY_PROTECTION', 'BATTERY_CABLE', 'MICRO_INVERTER',
  'ENERGY_SYSTEM_CONTROLLER', 'STRUCTURE', 'AC_ISOLATOR', 'CHANGEOVER',
];

export const ROLE_OWNER = {
  BATTERY: 'PROJECT_HEAD',
  BATTERY_PROTECTION: 'PROJECT_HEAD',
  MICRO_INVERTER: 'PROJECT_HEAD',
  ENERGY_SYSTEM_CONTROLLER: 'PROJECT_HEAD',
  PANEL: 'SALES_WITHIN_ALTERNATES',
  INVERTER: 'SALES_WITHIN_ALTERNATES',
  ACDB: 'SALES_WITHIN_ALTERNATES',
  DCDB: 'SALES_WITHIN_ALTERNATES',
};

/** A project configuration. `overrides` never leak back into the package. */
export function createProjectConfiguration({ projectId, packageId, packageDefaults = {} }) {
  return {
    projectId,
    packageId,
    packageDefaults: deepFreeze({ ...packageDefaults }),   // immutable reference copy
    overrides: {},
    history: [],
  };
}

/**
 * Record a Project Head selection. Returns a NEW configuration object —
 * the package defaults are never mutated.
 */
export function applyProjectOverride(config, { role, componentId, selectedBy, method = SELECTION_METHOD.PROJECT_HEAD_OVERRIDE, reason = null, at }) {
  if (!config) throw new Error('no project configuration');
  if (!role || !componentId) throw new Error('role and componentId are required');
  const entry = { role, componentId, selectedBy: selectedBy || null, selectionMethod: method, reason, at: at || null };
  return {
    ...config,
    packageDefaults: config.packageDefaults,               // untouched
    overrides: { ...config.overrides, [role]: entry },
    history: [...config.history, entry],
  };
}

/** Effective selection for a role, with full provenance. Never just a name. */
export function resolveSelection(config, role) {
  const ov = config?.overrides?.[role];
  if (ov) return { role, componentId: ov.componentId, selectionMethod: ov.selectionMethod,
                   selectedBy: ov.selectedBy, at: ov.at, source: 'PROJECT' };
  const def = config?.packageDefaults?.[role];
  if (def) return { role, componentId: typeof def === 'string' ? def : def.componentId,
                    selectionMethod: SELECTION_METHOD.PACKAGE_DEFAULT, selectedBy: null, at: null, source: 'PACKAGE' };
  return { role, componentId: null, selectionMethod: null, selectedBy: null, at: null, source: null };
}

/** Full effective configuration across every role. */
export function effectiveConfiguration(config) {
  const roles = new Set([...Object.keys(config?.packageDefaults || {}), ...Object.keys(config?.overrides || {})]);
  const out = {};
  for (const r of roles) out[r] = resolveSelection(config, r);
  return out;
}

/** Sales permission gate. Sales may never change an engineering-critical role. */
export function canRoleBeChangedBy(role, actorRole) {
  if (actorRole === 'ADMIN' || actorRole === 'PROJECT_HEAD') return true;
  if (actorRole === 'SALES') return !SALES_IMMUTABLE_ROLES.includes(role);
  return false;
}

/** Assert a change is permitted. Throws with the reason if not. */
export function assertCanChange(role, actorRole) {
  if (!canRoleBeChangedBy(role, actorRole))
    throw new Error(`${actorRole} may not change role ${role} — engineering-critical selection owned by ${ROLE_OWNER[role] || 'PROJECT_HEAD'}`);
  return true;
}

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}
