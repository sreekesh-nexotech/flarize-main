/**
 * AUTHORITATIVE BATTERY RESOLUTION.  (Phase 1C / 1D)
 *
 * ONE function decides battery identity, quantity and its dependent
 * accessories. Before this module the answer was derived independently in
 * three places that disagreed:
 *
 *   src/App.jsx:1600  variable slots  -> slot.batQty['0']            (hardcoded index -> always 0)
 *   src/App.jsx:1834  fixed items     -> fixed.batQty[batConfig]     (profile-derived -> 1)
 *   src/App.jsx:1775  micro branch    -> find('Flex Battery')        (name substring, enphase category)
 *
 * The disagreement is defect D1: Hybrid Value shipped battery cabling and a
 * change-over switch with no battery and no battery MCCB.
 * The category misuse is defect D2: the premium battery was emitted as an
 * `enphase` accessory at a different price than the catalog battery record.
 *
 * PHASE 1D — the battery is no longer bound to SEG, Deye or any single product.
 * Identity comes from (in order): a Project Head override, the package default,
 * then the engineering-approved catalog shortlist. Protection topology is read
 * from BATTERY MASTER DATA, not from a hardcoded per-component table.
 *
 * Pure and dependency-free: no React, no DOM, no I/O.
 *
 * BOUNDARY: this module answers "which battery component and how many".
 * It does not price, does not validate, does not present.
 */

import {
  toBatteryMaster,
  isSelectable as masterSelectable,
  isPermanentlyUnselectable,
  selectabilityReason,
  ENGINEERING_STATUS,
  BATTERY_PROTECTION_MODE as MASTER_PROTECTION_MODE,
} from './batteryMaster.js';
import { resolveProtectionRequirement } from './batteryCompatibility.js';
import { SELECTION_METHOD } from './projectConfiguration.js';

/**
 * Battery protection mode.  (Phase 1C — decision D12)
 * Deye/SEG and Enphase are DIFFERENT electrical topologies and must not share
 * one generic protection rule.
 */
export const BATTERY_PROTECTION_MODE = MASTER_PROTECTION_MODE;

/**
 * LEGACY per-battery protection table.  (Phase 1C)
 *
 * SUPERSEDED by data/battery-master.json in Phase 1D. It is retained ONLY as
 * the fallback for callers that do not supply master data (older tests,
 * offline scripts), so their behaviour does not silently change. When master
 * data IS supplied it is authoritative and this table is not consulted.
 *
 * Do not add entries here. Add master-data records instead.
 */
export const BATTERY_PROTECTION_BY_COMPONENT = {
  bt2: { mode: BATTERY_PROTECTION_MODE.INTEGRATED,
         providedBy: 'ENERGY_SYSTEM_CONTROLLER',
         source: 'decision D12 — Enphase premium architecture' },
  bt1: { mode: BATTERY_PROTECTION_MODE.UNKNOWN, providedBy: null,
         source: 'decision D12 — per-battery confirmation still pending' },
  bt3: { mode: BATTERY_PROTECTION_MODE.UNKNOWN, providedBy: null,
         source: 'decision D12 — per-battery confirmation still pending' },
  bt4: { mode: BATTERY_PROTECTION_MODE.UNKNOWN, providedBy: null,
         source: 'decision D12 — per-battery confirmation still pending' },
};

/** Battery products that exist twice in the catalog under different identities. */
export const BATTERY_IDENTITY_ALIASES = [
  {
    canonical: 'bt2',              // categories.battery -> "Enphase Flex Battery"
    aliasCategory: 'enphase',
    aliasNameMatch: /Flex Battery/i,
    note: 'Same physical product recorded twice: categories.battery.bt2 and an ' +
          'enphase accessory row. Prices differ. Canonical record is bt2. ' +
          'The alias is retained for catalog traceability and must NOT be deleted ' +
          'before the relationship is reviewed (Phase 1G).',
  },
];

/**
 * The engineering-approved shortlist a Project Head may choose from.
 * Nothing is hidden silently: every rejected candidate is returned with a reason.
 *
 * @param {object} catalog
 * @param {object} master   overlay keyed by componentId (data/battery-master.json .batteries)
 * @param {object} ctx      { tier, sysType }
 */
export function approvedBatteryShortlist(catalog, master = {}, ctx = {}) {
  const { tier = null } = ctx;
  const items = catalog?.categories?.battery?.items || [];
  const selectable = [], rejected = [];
  for (const item of items) {
    const rec = toBatteryMaster(item, master[item.id] || {});
    const tierOk = !tier || (Array.isArray(item.tiers) && item.tiers.includes(tier));
    if (!tierOk) { rejected.push({ componentId: item.id, reason: `not offered in tier "${tier}"` }); continue; }
    if (!localActive(item)) { rejected.push({ componentId: item.id, reason: `catalog status is ${item.status}` }); continue; }
    if (!masterSelectable(rec)) { rejected.push({ componentId: item.id, reason: selectabilityReason(rec) }); continue; }
    selectable.push(rec);
  }
  return { selectable, rejected };
}

/**
 * Resolve the battery configuration for a package.
 *
 * @param {object} profile  packageProfiles entry — authoritative for QUANTITY
 * @param {object} catalog  full catalog
 * @param {object} context  {
 *   sysType, tier, sizeKey, template,
 *   batteryMaster,      // overlay keyed by componentId. When present it is authoritative.
 *   projectOverride,    // { componentId, selectedBy, at } — Project Head selection
 *   inverter,           // selected inverter, for protection/compatibility context
 * }
 * @returns {{
 *   quantity: number, required: boolean,
 *   componentId: string|null, component: object|null, master: object|null,
 *   category: 'battery',
 *   selectionMethod: string|null, approvalStatus: string|null,
 *   spec: {brand,model,capacityKwh,unitPrice},
 *   protection: object,
 *   requiresMccb: boolean, requiresCable: boolean, requiresChangeOver: boolean,
 *   batQtyIndex: string, source: string,
 *   issues: Array<{code,message}>
 * }}
 */
export function resolveBattery(profile, catalog, context = {}) {
  const {
    sysType = 'ongrid',
    tier = 'value',
    batteryMaster = null,
    projectOverride = null,
    projectBatteryQuantity = null, // B.6 (locked 2.3, 2026-09-05) — project-level 0/1/2 override
  } = context;
  const issues = [];
  const master = batteryMaster || null;
  const haveMaster = !!master && Object.keys(master).length > 0;

  const declaredQty = Number(profile?.batteryQuantity ?? 0);
  const declaredIncluded = !!profile?.batteryIncluded;

  // B.6 (locked 2.3, 2026-09-05) — Project Head battery quantity is authoritative
  // per-project (0/1/2). Profile provides the DEFAULT quantity; when the caller
  // supplies `projectBatteryQuantity`, that overrides the profile. Engineering
  // validation (ENG-BAT-006) still flags profile/project inconsistency — this
  // does not silence it, it records the source of the effective quantity.
  const isValidProjectQty = (projectBatteryQuantity === 0
                          || projectBatteryQuantity === 1
                          || projectBatteryQuantity === 2);
  const effectiveDeclaredQty = isValidProjectQty ? projectBatteryQuantity : declaredQty;

  // Profile is authoritative for quantity BY DEFAULT; project override wins.
  // Non-hybrid systems never carry one.
  const quantity = sysType === 'hybrid' ? effectiveDeclaredQty : 0;
  const quantitySource = sysType !== 'hybrid'
    ? 'NONE'
    : (isValidProjectQty ? 'PROJECT_HEAD_OVERRIDE' : 'PROFILE_DEFAULT');

  if (declaredIncluded && declaredQty === 0) {
    issues.push({ code: 'PROFILE_INCONSISTENT',
      message: 'Profile sets batteryIncluded=true but batteryQuantity=0.' });
  }
  if (!declaredIncluded && declaredQty > 0) {
    issues.push({ code: 'PROFILE_INCONSISTENT',
      message: `Profile sets batteryIncluded=false but batteryQuantity=${declaredQty}.` });
  }
  if (sysType !== 'hybrid' && declaredQty > 0) {
    issues.push({ code: 'BATTERY_ON_NON_HYBRID',
      message: `Profile declares a battery for system type "${sysType}". Ignored.` });
  }
  // B.6 — flag project-vs-profile mismatch as WARNING so engineering sees it
  if (sysType === 'hybrid' && isValidProjectQty && projectBatteryQuantity !== declaredQty) {
    issues.push({ code: 'BATTERY_QUANTITY_PROJECT_OVERRIDE',
      message: `Project Head battery quantity ${projectBatteryQuantity} overrides profile default ${declaredQty}. Engineering must confirm compatibility.` });
  }

  const required = quantity > 0;

  // --- component identity: always the canonical `battery` category ---------
  let component = null;
  let source = 'none';
  let selectionMethod = null;
  const batteries = catalog?.categories?.battery?.items || [];
  const recFor = (item) => (item ? toBatteryMaster(item, (master && master[item.id]) || {}) : null);

  /**
   * FREE-SELECTION gate — what a Project Head may newly choose.
   * Strict: APPROVED and commercially available only.
   */
  const gateOk = (item) => {
    if (!localActive(item)) return false;
    if (!haveMaster) return true;                      // legacy caller — behaviour unchanged
    return masterSelectable(recFor(item));
  };

  /**
   * DEFAULT-RESOLUTION gate — what the package may still resolve to.
   *
   * Deliberately weaker. A battery PENDING engineering approval stays resolvable
   * so the package keeps its battery and the configuration is BLOCKED by
   * validation. Deleting it would emit a hybrid BOM with no battery (defect D1)
   * and would be a silent, unsafe change. Only REJECTED / WITHDRAWN / INACTIVE /
   * DISCONTINUED records are removed outright.
   */
  const resolvableOk = (item) => {
    if (!localActive(item)) return false;
    if (!haveMaster) return true;
    return !isPermanentlyUnselectable(recFor(item));
  };

  if (required) {
    // 1. Project Head override (project-level, never mutates the package)
    if (projectOverride?.componentId) {
      const cand = batteries.find(b => b.id === projectOverride.componentId) || null;
      if (!cand) {
        issues.push({ code: 'BATTERY_OVERRIDE_NOT_FOUND',
          message: `Project override battery "${projectOverride.componentId}" is not in categories.battery. BLOCKED — no substitution is made.` });
      } else if (!gateOk(cand)) {
        // NEVER silently swap to another battery.
        issues.push({ code: 'BATTERY_OVERRIDE_NOT_SELECTABLE',
          message: `Project override battery "${cand.name}" is not selectable: ${selectabilityReason(recFor(cand)) || 'catalog status'}. ` +
                   `BLOCKED — no automatic substitution.` });
        component = cand;                              // keep identity so the block names it
        source = 'projectOverride(blocked)';
        selectionMethod = SELECTION_METHOD.PROJECT_HEAD_OVERRIDE;
      } else {
        component = cand;
        source = 'projectOverride';
        selectionMethod = SELECTION_METHOD.PROJECT_HEAD_OVERRIDE;
      }
    }

    // 2. explicit componentId on the package profile (the package default)
    if (!component && profile?.batteryComponentId) {
      component = batteries.find(b => b.id === profile.batteryComponentId) || null;
      if (component) { source = 'profile.batteryComponentId'; selectionMethod = SELECTION_METHOD.PACKAGE_DEFAULT; }
      else issues.push({ code: 'BATTERY_COMPONENT_NOT_FOUND',
        message: `Profile batteryComponentId "${profile.batteryComponentId}" is not in categories.battery.` });
    }

    // 3. tier-scoped catalog shortlist.
    // Candidates are filtered by `resolvableOk`, NOT by approval. Approval must
    // never reorder identity: if approving some other battery could change which
    // battery a package resolves to, that is a silent substitution. Approval is
    // asserted separately below and blocks the configuration instead.
    if (!component) {
      const tierMatches = batteries.filter(b => (b.tiers || []).includes(tier) && resolvableOk(b));
      if (tierMatches.length === 1) {
        component = tierMatches[0]; source = `catalog.battery[tier=${tier}]`;
        selectionMethod = SELECTION_METHOD.PACKAGE_DEFAULT;
      } else if (tierMatches.length > 1) {
        component = tierMatches[0];
        source = `catalog.battery[tier=${tier}][0]`;
        selectionMethod = SELECTION_METHOD.FALLBACK;
        issues.push({ code: 'BATTERY_AMBIGUOUS',
          message: `${tierMatches.length} batteries available for tier "${tier}"; the package does not name one. ` +
                   `Chose "${component.name}". Define batteryComponentId on the profile.` });
      }
    }
    if (!component) {
      issues.push({ code: 'BATTERY_NO_CANDIDATE',
        message: `No usable battery in categories.battery for tier "${tier}".` });
    }
  }

  const rec = recFor(component);

  // Engineering approval of the RESOLVED battery. An APPROVED status must never
  // be implied by the fact that a battery resolved — it is checked explicitly.
  const engineeringApproved = !required ? true
    : (!haveMaster ? true : rec?.engineeringStatus === ENGINEERING_STATUS.APPROVED);

  if (required && haveMaster && !engineeringApproved)
    issues.push({ code: 'BATTERY_NOT_ENGINEERING_APPROVED',
      message: `Battery "${component?.name || component?.id}" is ${rec?.engineeringStatus}. ` +
               `It is retained in the BOM so the system is not silently shipped without a battery, ` +
               `but the configuration is BLOCKED until Engineering approves it. ` +
               `Open items: ${(master?.[component?.id]?.openItems || []).join(', ') || 'see battery master data'}.` });

  // --- protection topology (D12 -> Phase 1D master data) -------------------
  // Master data is authoritative. The legacy table is consulted ONLY when no
  // master record exists, so callers without an overlay keep their behaviour.
  let prot;
  if (haveMaster && rec) {
    const req = resolveProtectionRequirement(rec);
    prot = {
      mode: req.mode,
      providedBy: rec.protectionType || null,
      rating: req.rating,                 // null means NOT RECORDED — never assume 160 A / 125 A
      source: `battery master data (${rec.componentId})`,
      reason: req.reason,
    };
  } else {
    prot = BATTERY_PROTECTION_BY_COMPONENT[component?.id] ||
      { mode: BATTERY_PROTECTION_MODE.UNKNOWN, providedBy: null,
        source: 'no decision recorded for this component' };
    prot = { ...prot, rating: null };
  }

  // INTEGRATED  -> no external protection device, and no generic DC battery cable.
  // UNKNOWN     -> preserve existing template behaviour; validation warns.
  // EXTERNAL_*  -> external device expected.
  const requiresExternalProtection = required && (
    prot.mode === BATTERY_PROTECTION_MODE.EXTERNAL_REQUIRED ||
    prot.mode === BATTERY_PROTECTION_MODE.UNKNOWN);
  const requiresGenericDcCable = requiresExternalProtection;

  if (required && prot.mode === BATTERY_PROTECTION_MODE.UNKNOWN)
    issues.push({ code: 'BATTERY_PROTECTION_MODE_UNKNOWN',
      message: `Battery protection mode for "${component?.name || component?.id}" is not confirmed. ` +
               `Existing template behaviour preserved. Engineering confirmation required (D12).` });

  if (required && prot.mode === BATTERY_PROTECTION_MODE.EXTERNAL_REQUIRED && prot.rating == null)
    issues.push({ code: 'BATTERY_PROTECTION_RATING_UNRECORDED',
      message: `External battery protection is required for "${component?.name || component?.id}" but the RATING is not recorded. ` +
               `It must not be assumed or derived from Ah. Engineering verification pending (D12).` });

  return {
    protection: { ...prot, requiresExternalProtection, requiresGenericDcCable },
    quantity,
    required,
    componentId: component?.id || null,
    component,
    master: rec,
    category: 'battery',                 // D2: never `enphase`, never an accessory
    // Phase 1D §8 traceability. The BOM stores identity + provenance, never a name.
    selectionMethod,
    approvalStatus: rec?.engineeringStatus || null,
    engineeringApproved,
    missingForSafeIssue: rec?.missingForSafeIssue || [],
    selectedBy: projectOverride?.selectedBy || null,
    selectionTimestamp: projectOverride?.at || null,
    spec: {
      brand: component?.brand || profile?.batteryBrand || null,
      model: component?.model || profile?.batteryModel || null,
      capacityKwh: component?.kwh ?? profile?.batteryCapacity ?? null,
      unitPrice: component?.price ?? null,
    },
    // Dependent items follow the battery. They may never appear without it.
    // D12: topology-aware. An INTEGRATED-protection battery (Enphase) must NOT
    // pull in the generic Deye/SEG MCCB or the generic 25 mm DC battery cable.
    requiresMccb: requiresExternalProtection,
    requiresCable: requiresGenericDcCable,
    requiresChangeOver: required,
    // The index the legacy bomTemplates batQty maps are keyed by.
    batQtyIndex: String(quantity),
    source,
    // B.6 (locked 2.3, 2026-09-05) — source of the effective quantity.
    // PROJECT_HEAD_OVERRIDE | PROFILE_DEFAULT | NONE.
    quantitySource,
    profileDeclaredQuantity: declaredQty,
    projectOverrideQuantity: isValidProjectQty ? projectBatteryQuantity : null,
    issues,
  };
}

/** Catalog-level activity only. Engineering approval is a separate gate. */
function localActive(item) {
  if (!item) return false;
  if (item.status && item.status !== 'ACTIVE') return false;
  return Array.isArray(item.tiers) && item.tiers.length > 0;
}

/**
 * Is this BOM line the alias identity of a canonical battery?
 * Used to stop the micro-inverter branch emitting a second battery record.
 */
export function isBatteryAlias(categoryKey, name) {
  return BATTERY_IDENTITY_ALIASES.some(a =>
    a.aliasCategory === categoryKey && a.aliasNameMatch.test(name || ''));
}

/** Canonical id for an alias, or null. */
export function canonicalBatteryIdFor(categoryKey, name) {
  const hit = BATTERY_IDENTITY_ALIASES.find(a =>
    a.aliasCategory === categoryKey && a.aliasNameMatch.test(name || ''));
  return hit ? hit.canonical : null;
}
