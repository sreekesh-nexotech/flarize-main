/**
 * UPGRADE IDENTITY MODEL.  (Phase 1F — defects D6, D10)
 *
 * D6: premium 3->8 and 5->10 produce byte-identical BOMs, because both are a
 * 5 kW delta and premium carries no central inverter. The BOM alone therefore
 * cannot tell you what was upgraded. Identity must live in the QUOTATION, not
 * be forced into the BOM.
 *
 * D10: the shipped default enables wiring only, so the out-of-box upgrade
 * quotation is consumables and is not sellable. Policy is declared here rather
 * than by silently changing the default (which would move the frozen baseline).
 *
 * BOUNDARY: identity + policy. Emits no components, no prices.
 */

/** Engineering-approved upgrade paths (decision C10). */
export const APPROVED_UPGRADE_PATHS = [
  { id: 'UPG-3-5',  fromKw: 3, toKw: 5,  explicitBom: true  },
  { id: 'UPG-3-6',  fromKw: 3, toKw: 6,  explicitBom: false, note: 'approved but bomTemplates.upgrade has no "3_6" fixedItems; currently auto-scaled' },
  { id: 'UPG-3-8',  fromKw: 3, toKw: 8,  explicitBom: false, note: 'approved but bomTemplates.upgrade has no "3_8" fixedItems; currently auto-scaled' },
  { id: 'UPG-5-8',  fromKw: 5, toKw: 8,  explicitBom: true  },
  { id: 'UPG-5-10', fromKw: 5, toKw: 10, explicitBom: true  },
  { id: 'UPG-8-10', fromKw: 8, toKw: 10, explicitBom: true  },
];

/** Sections that must be selected before an upgrade quotation is sellable. */
export const MANDATORY_UPGRADE_SECTIONS = ['panels', 'structure', 'inverter', 'wiring'];
export const OPTIONAL_UPGRADE_SECTIONS = ['hybridInv', 'battery'];

/** Build the identity an upgrade quotation must carry, BOM-independent. */
export function buildUpgradeIdentity({ fromKw, toKw, tier, sections }) {
  const from = Number(fromKw), to = Number(toKw);
  const path = APPROVED_UPGRADE_PATHS.find(p => p.fromKw === from && p.toKw === to);
  return {
    upgradePathId: path ? path.id : `UNAPPROVED-${from}-${to}`,
    fromSize: from,
    toSize: to,
    deltaKw: Math.round((to - from) * 100) / 100,
    tier,
    approved: !!path,
    explicitBom: path ? path.explicitBom : false,
    sections: sections || null,
    note: path?.note || (path ? null : 'Path is not in the approved list.'),
  };
}

/** Two upgrades are the same job only if their full identity matches. */
export function upgradeIdentityKey(identity) {
  return [identity.upgradePathId, identity.fromSize, identity.toSize,
          identity.deltaKw, identity.tier].join('|');
}

/** Sellability check for the section policy (D10). */
export function checkUpgradeSectionPolicy(sections) {
  const missing = MANDATORY_UPGRADE_SECTIONS.filter(s => !sections?.[s]);
  return {
    sellable: missing.length === 0,
    missingMandatory: missing,
    message: missing.length
      ? `Upgrade quotation is not sellable: mandatory section(s) not selected — ${missing.join(', ')}.`
      : 'All mandatory upgrade sections selected.',
  };
}
