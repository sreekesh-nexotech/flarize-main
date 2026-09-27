/**
 * PACKAGE AUTHORITY.  (Phase 1B)
 *
 * The package profile — not the catalog array order, not the UI — decides which
 * engineering-critical components a system uses.
 *
 * `packageComponents` names the approved component per role.
 * `approvedAlternates` lists the other componentIds a user may legitimately
 * choose for that role. Anything outside that list is not a valid selection.
 *
 * Phase 1 scope: the model plus derivation from existing catalog data. It is
 * NOT yet enforced in the BOM engine — enforcement would change the frozen
 * baseline for every cell (see DECISION_LOG C23).
 *
 * BOUNDARY: "which component is approved". Not quantity, not price, not validity.
 */

import { toComponent, isSelectable } from './componentIdentity.js';

/** Roles a package may pin. */
export const PACKAGE_ROLES = [
  'panel', 'inverter', 'microInverter', 'battery', 'batteryMccb',
  'dcdb', 'acdb', 'meter', 'isolator', 'dcCable', 'acCable',
  'earthCable', 'laCable', 'cbRod', 'structure',
];

/** Roles Sales may choose among approved alternates for (decision C12, revised 2026-09-02).
 *
 * Revision: Sales direct-selectable roles are panel, inverter and structure.
 * ACDB / DCDB are engineering-sensitive and no longer directly changeable by Sales —
 * they must go through the existing engineering approval workflow.
 */
export const SALES_SELECTABLE_ROLES = ['panel', 'inverter', 'structure'];

/** Roles that are engineering-critical: never freely editable by Sales. */
export const ENGINEERING_CRITICAL_ROLES = PACKAGE_ROLES.filter(
  r => !SALES_SELECTABLE_ROLES.includes(r));

const ROLE_TO_CATEGORY = {
  panel: 'panel', inverter: 'inverter', microInverter: 'enphase',
  battery: 'battery', batteryMccb: 'mccb_box', dcdb: 'dcdb', acdb: 'acdb',
  meter: 'meter', isolator: 'isolator', dcCable: 'dc_cable', acCable: 'ac_cable',
  earthCable: 'earth_cable', laCable: 'la_cable', cbRod: 'cb_rod',
  structure: 'structure_material',
};

/**
 * Derive packageComponents + approvedAlternates for a profile from the current
 * catalog. Every alternate references a real componentId — never a name.
 *
 * `explicit` entries (profile.components[role]) win. Otherwise the tier-scoped
 * catalog set is offered as alternates and the first is proposed, with
 * `pinned:false` recording that the package has not actually decided.
 */
export function derivePackageComponents(profile, catalog, { tier, phase } = {}) {
  const components = {};
  const unpinned = [];

  for (const role of PACKAGE_ROLES) {
    const categoryKey = ROLE_TO_CATEGORY[role];
    if (!categoryKey) continue;
    const items = (catalog?.categories?.[categoryKey]?.items || [])
      .map(i => toComponent(categoryKey, i))
      .filter(isSelectable)
      .filter(c => !tier || c.tiers.includes(tier))
      .filter(c => !phase || !c.raw.phase || c.raw.phase === phase);

    const explicitId = profile?.components?.[role] ||
      (role === 'battery' ? profile?.batteryComponentId : null);
    const explicit = explicitId ? items.find(c => c.componentId === explicitId) : null;

    if (!items.length && !explicit) continue;

    const chosen = explicit || items[0];
    if (!explicit) unpinned.push(role);

    components[role] = {
      role,
      category: categoryKey,
      componentId: chosen?.componentId || null,
      pinned: !!explicit,
      salesSelectable: SALES_SELECTABLE_ROLES.includes(role),
      approvedAlternates: items.map(c => c.componentId),
    };
  }
  return { components, unpinnedRoles: unpinned };
}

/** Is `componentId` an approved choice for this role? */
export function isApprovedSelection(packageComponents, role, componentId) {
  const entry = packageComponents?.[role];
  if (!entry) return false;
  return entry.componentId === componentId || entry.approvedAlternates.includes(componentId);
}

/** May a Sales user change this role at all? (decision C12) */
export function isSalesEditable(role) {
  return SALES_SELECTABLE_ROLES.includes(role);
}
