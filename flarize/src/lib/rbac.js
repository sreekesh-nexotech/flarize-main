/**
 * RBAC — ROLE ENFORCEMENT AT THE APPLICATION SERVICE BOUNDARY.  (Phase 3, PART G)
 *
 * This module adds NO new ownership rules. The authoritative ownership model
 * already exists in the domain layer and is imported here, not restated:
 *
 *   projectConfiguration.SALES_IMMUTABLE_ROLES   which BOM roles Sales may never touch
 *   projectConfiguration.canRoleBeChangedBy      per-role actor check
 *   costEngine.COST_HEAD_OWNER                   who owns each cost head
 *   commercialHistory.CONFIG_OWNER               who owns each commercial configuration
 *
 * What this module adds is only the *capability* layer: which application
 * operation a role may invoke at all. Where a domain rule already exists, the
 * capability check is a coarse pre-filter and the domain rule remains the final
 * word — both run, and the domain rule can still refuse after RBAC allows.
 *
 * No role may be granted a capability by data. The matrix is code.
 */

import { SALES_IMMUTABLE_ROLES, canRoleBeChangedBy } from './projectConfiguration.js';
import { COST_HEAD_OWNER } from './costEngine.js';
import { CONFIG_OWNER } from './commercialHistory.js';

export const RBAC_VERSION = 'rbac.1';

export const ROLE = {
  ADMIN: 'ADMIN',
  PROJECT_HEAD: 'PROJECT_HEAD',
  ENGINEERING: 'ENGINEERING',
  PROCUREMENT: 'PROCUREMENT',
  SALES: 'SALES',
  SALES_HEAD: 'SALES_HEAD',
  SALES_CRS: 'SALES_CRS',
  FIELD_SALES: 'FIELD_SALES',
};

export const ALL_ROLES = Object.values(ROLE);

/** Application capabilities. One per service operation, not per HTTP route. */
export const CAPABILITY = {
  PROJECT_CREATE: 'PROJECT_CREATE',
  PROJECT_VIEW: 'PROJECT_VIEW',
  PROJECT_CONFIGURE: 'PROJECT_CONFIGURE',        // customer, architecture, sysType, size, phase
  PACKAGE_SELECT: 'PACKAGE_SELECT',
  BOM_VIEW: 'BOM_VIEW',
  BOM_EDIT: 'BOM_EDIT',                          // add / change / remove a project BOM line
  BOM_RUN_CHECKER: 'BOM_RUN_CHECKER',
  BOM_LOCK: 'BOM_LOCK',
  BOM_ACKNOWLEDGE_WARNING: 'BOM_ACKNOWLEDGE_WARNING',
  ENGINEERING_APPROVE: 'ENGINEERING_APPROVE',    // component / package engineering approval
  COST_VIEW: 'COST_VIEW',
  COST_INPUT_EDIT: 'COST_INPUT_EDIT',            // distance, vehicle, special works, structure
  PRICING_VIEW: 'PRICING_VIEW',
  DISCOUNT_REQUEST: 'DISCOUNT_REQUEST',
  MARGIN_APPROVE: 'MARGIN_APPROVE',
  COMMERCIAL_CONFIG_EDIT: 'COMMERCIAL_CONFIG_EDIT',
  COMMERCIAL_HISTORY_VIEW: 'COMMERCIAL_HISTORY_VIEW',
  RATE_CARD_EDIT: 'RATE_CARD_EDIT',
  PROCUREMENT_PRICE_EDIT: 'PROCUREMENT_PRICE_EDIT',
  QUOTATION_CREATE: 'QUOTATION_CREATE',
  CMS_VIEW: 'CMS_VIEW',
  CMS_EDIT: 'CMS_EDIT',
  CMS_PUBLISH: 'CMS_PUBLISH',
  CMS_ASSET_MANAGE: 'CMS_ASSET_MANAGE',
  // Phase 3 V4 — package authoring & approval lifecycle. Additive; the
  // legacy engineering-approval capability remains on ENGINEERING as an
  // anti-restart invariant. PACKAGE_APPROVE is the sole authority for
  // lifecycle approval in V4 and is held by ADMIN only.
  PACKAGE_CREATE:    'PACKAGE_CREATE',
  PACKAGE_DUPLICATE: 'PACKAGE_DUPLICATE',
  PACKAGE_EDIT:      'PACKAGE_EDIT',
  PACKAGE_SUBMIT:    'PACKAGE_SUBMIT',
  PACKAGE_ARCHIVE:   'PACKAGE_ARCHIVE',
  PACKAGE_COMPARE:   'PACKAGE_COMPARE',
  PACKAGE_APPROVE:   'PACKAGE_APPROVE',
};

/**
 * The matrix. Deliberately explicit: a role sees exactly what is listed.
 *
 * SALES appears nowhere near BOM_EDIT, BOM_LOCK or ENGINEERING_APPROVE — the
 * brief requires that Sales cannot modify engineering BOM authority.
 */
export const CAPABILITY_MATRIX = Object.freeze({
  [ROLE.ADMIN]: Object.freeze([
    CAPABILITY.PROJECT_VIEW, CAPABILITY.BOM_VIEW, CAPABILITY.BOM_RUN_CHECKER,
    CAPABILITY.COST_VIEW, CAPABILITY.PRICING_VIEW,
    CAPABILITY.COMMERCIAL_CONFIG_EDIT, CAPABILITY.COMMERCIAL_HISTORY_VIEW,
    CAPABILITY.CMS_VIEW, CAPABILITY.CMS_EDIT, CAPABILITY.CMS_PUBLISH, CAPABILITY.CMS_ASSET_MANAGE,
    CAPABILITY.QUOTATION_CREATE,
    CAPABILITY.PACKAGE_APPROVE, CAPABILITY.PACKAGE_ARCHIVE, CAPABILITY.PACKAGE_COMPARE,
  ]),
  [ROLE.PROJECT_HEAD]: Object.freeze([
    CAPABILITY.PROJECT_CREATE, CAPABILITY.PROJECT_VIEW, CAPABILITY.PROJECT_CONFIGURE,
    CAPABILITY.PACKAGE_SELECT, CAPABILITY.BOM_VIEW, CAPABILITY.BOM_EDIT,
    CAPABILITY.BOM_RUN_CHECKER, CAPABILITY.BOM_LOCK, CAPABILITY.BOM_ACKNOWLEDGE_WARNING,
    CAPABILITY.COST_VIEW, CAPABILITY.COST_INPUT_EDIT, CAPABILITY.PRICING_VIEW,
    CAPABILITY.COMMERCIAL_HISTORY_VIEW, CAPABILITY.RATE_CARD_EDIT,
    CAPABILITY.CMS_VIEW, CAPABILITY.CMS_EDIT, CAPABILITY.CMS_PUBLISH, CAPABILITY.CMS_ASSET_MANAGE,
    CAPABILITY.PACKAGE_CREATE, CAPABILITY.PACKAGE_DUPLICATE, CAPABILITY.PACKAGE_EDIT,
    CAPABILITY.PACKAGE_SUBMIT, CAPABILITY.PACKAGE_ARCHIVE, CAPABILITY.PACKAGE_COMPARE,
  ]),
  [ROLE.ENGINEERING]: Object.freeze([
    CAPABILITY.PROJECT_VIEW, CAPABILITY.BOM_VIEW, CAPABILITY.BOM_RUN_CHECKER,
    CAPABILITY.ENGINEERING_APPROVE,
    CAPABILITY.PACKAGE_COMPARE,
  ]),
  [ROLE.PROCUREMENT]: Object.freeze([
    CAPABILITY.PROJECT_VIEW, CAPABILITY.BOM_VIEW,
    CAPABILITY.PROCUREMENT_PRICE_EDIT, CAPABILITY.COMMERCIAL_HISTORY_VIEW,
  ]),
  [ROLE.SALES]: Object.freeze([
    CAPABILITY.PROJECT_VIEW, CAPABILITY.BOM_VIEW, CAPABILITY.PRICING_VIEW,
    CAPABILITY.DISCOUNT_REQUEST, CAPABILITY.QUOTATION_CREATE,
  ]),
  [ROLE.SALES_HEAD]: Object.freeze([
    CAPABILITY.PROJECT_VIEW, CAPABILITY.BOM_VIEW, CAPABILITY.PRICING_VIEW,
    CAPABILITY.DISCOUNT_REQUEST, CAPABILITY.QUOTATION_CREATE, CAPABILITY.MARGIN_APPROVE,
  ]),
  [ROLE.SALES_CRS]: Object.freeze([
    CAPABILITY.PROJECT_VIEW, CAPABILITY.BOM_VIEW, CAPABILITY.PRICING_VIEW,
    CAPABILITY.DISCOUNT_REQUEST, CAPABILITY.QUOTATION_CREATE,
  ]),
  [ROLE.FIELD_SALES]: Object.freeze([
    CAPABILITY.PROJECT_VIEW, CAPABILITY.BOM_VIEW, CAPABILITY.PRICING_VIEW,
    CAPABILITY.DISCOUNT_REQUEST, CAPABILITY.QUOTATION_CREATE,
  ]),
});

export const RBAC_ERROR = {
  UNKNOWN_ROLE: 'UNKNOWN_ROLE',
  NO_ACTOR: 'NO_ACTOR',
  CAPABILITY_DENIED: 'CAPABILITY_DENIED',
  ROLE_NOT_OWNER: 'ROLE_NOT_OWNER',
  BOM_ROLE_IMMUTABLE_FOR_ACTOR: 'BOM_ROLE_IMMUTABLE_FOR_ACTOR',
};

export class RbacError extends Error {
  constructor(code, message, detail = null) {
    super(message);
    this.name = 'RbacError';
    this.code = code;
    this.detail = detail;
  }
}

/** Is `actorRole` a role the system knows about? */
export function isKnownRole(actorRole) {
  return ALL_ROLES.includes(actorRole);
}

/** Capability check. No implicit grants, no wildcard, no "admin can do anything". */
export function can(actorRole, capability) {
  if (!isKnownRole(actorRole)) return false;
  return (CAPABILITY_MATRIX[actorRole] || []).includes(capability);
}

/** Throwing form used at the service boundary. */
export function assertCan(actor, capability) {
  const role = actor?.role ?? null;
  if (!actor || !actor.userId || !role)
    throw new RbacError(RBAC_ERROR.NO_ACTOR,
      'Every workspace operation requires an actor { userId, role }. Anonymous operations are not permitted.');
  if (!isKnownRole(role))
    throw new RbacError(RBAC_ERROR.UNKNOWN_ROLE, `Unknown role "${role}".`, { role });
  if (!can(role, capability))
    throw new RbacError(RBAC_ERROR.CAPABILITY_DENIED,
      `Role ${role} may not perform ${capability}.`, { role, capability });
  return true;
}

/**
 * BOM role edit check. RBAC gates the operation; the DOMAIN rule
 * (canRoleBeChangedBy / SALES_IMMUTABLE_ROLES) decides the specific role, and
 * is authoritative. Both must pass.
 */
export function assertCanEditBomRole(actor, bomRole) {
  assertCan(actor, CAPABILITY.BOM_EDIT);
  if (!canRoleBeChangedBy(bomRole, actor.role))
    throw new RbacError(RBAC_ERROR.BOM_ROLE_IMMUTABLE_FOR_ACTOR,
      `Role ${actor.role} may not change BOM role "${bomRole}" — it is engineering-controlled.`,
      { bomRole, actorRole: actor.role, salesImmutableRoles: SALES_IMMUTABLE_ROLES });
  return true;
}

/** Cost head ownership — from costEngine.COST_HEAD_OWNER, not restated here. */
export function assertOwnsCostHead(actor, head) {
  assertCan(actor, CAPABILITY.COST_INPUT_EDIT);
  const owner = COST_HEAD_OWNER[head];
  if (!owner) throw new RbacError(RBAC_ERROR.ROLE_NOT_OWNER, `Unknown cost head "${head}".`, { head });
  if (owner !== actor.role)
    throw new RbacError(RBAC_ERROR.ROLE_NOT_OWNER,
      `Cost head ${head} is owned by ${owner}. ${actor.role} may not change it.`,
      { head, owner, actorRole: actor.role });
  return true;
}

/** Commercial configuration ownership — from commercialHistory.CONFIG_OWNER. */
export function assertOwnsConfig(actor, configType) {
  assertCan(actor, CAPABILITY.COMMERCIAL_CONFIG_EDIT);
  const owner = CONFIG_OWNER[configType];
  if (!owner) throw new RbacError(RBAC_ERROR.ROLE_NOT_OWNER, `Unknown configuration type "${configType}".`, { configType });
  if (owner !== actor.role)
    throw new RbacError(RBAC_ERROR.ROLE_NOT_OWNER,
      `Configuration ${configType} is owned by ${owner}. ${actor.role} may not change it.`,
      { configType, owner, actorRole: actor.role });
  return true;
}

/** Roles that represent individual salespeople — own-data visibility only. */
export const INDIVIDUAL_SALES_ROLES = Object.freeze([ROLE.SALES, ROLE.SALES_CRS, ROLE.FIELD_SALES]);

/** Does this role see only its own quotations/customers? */
export function isIndividualSalesRole(role) {
  return INDIVIDUAL_SALES_ROLES.includes(role);
}

/** What the UI should render for this role. Presentation only — never a grant. */
export function capabilitiesOf(actorRole) {
  return isKnownRole(actorRole) ? [...CAPABILITY_MATRIX[actorRole]].sort() : [];
}
