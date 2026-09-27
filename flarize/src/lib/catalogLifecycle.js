/**
 * CATALOG LIFECYCLE CLASSIFICATION.  (Phase 1G — defect D8)
 *
 * Classifies catalog records. Deletes nothing, changes no price.
 *
 * Phase 1 posture: classification is DATA and drives VALIDATION. It does NOT
 * filter production dropdowns yet — see DECISION_LOG C25. Filtering today
 * would remove the only value-tier 1P isolator and leave those systems with no
 * isolator at all (defect D11), which is worse than surfacing it.
 *
 * BOUNDARY: record status only. Not identity, not validity, not price.
 */

import { COMPONENT_STATUS } from './componentIdentity.js';

/** Names that indicate an unfinished placeholder record. */
const PLACEHOLDER_NAME = /^\s*(new|test|demo|sample|dummy|temp|tmp|xxx|asdf|qwerty)\b/i;
/** Lowercase, no brand, short — hallmarks of a hand-typed trial record. */
const SLOPPY_NAME = /^[a-z]+\s*\d{2,4}\s*$/;

/** Categories whose items are consumables and legitimately carry no brand. */
const CONSUMABLE_CATEGORIES = new Set([
  'mc4_connector', 'cable_tie', 'flexible_pipe', 'ss_screw', 'copper_lug',
  'insulation_tape', 'conduit_pipe', 'solar_clamp', 'structure_material',
  'painting_material', 'welding_material', 'earthing_material',
]);

/**
 * @returns {{status, reasons:string[], suggestedAction:string}}
 */
export function classifyCatalogItem(categoryKey, item, context = {}) {
  const reasons = [];
  const name = (item?.name || '').trim();
  const isConsumable = CONSUMABLE_CATEGORIES.has(categoryKey);

  if (item?.status && Object.values(COMPONENT_STATUS).includes(item.status))
    return { status: item.status, reasons: ['explicitly set on the record'], suggestedAction: 'none' };

  if (PLACEHOLDER_NAME.test(name)) reasons.push(`name "${name}" looks like a placeholder`);
  if (SLOPPY_NAME.test(name)) reasons.push(`name "${name}" is lowercase and unqualified`);
  if (!isConsumable && !item?.brand) reasons.push('no brand on a branded-category item');
  if (item?.price === 0) reasons.push('price is zero');
  if (Array.isArray(item?.tiers) && item.tiers.length === 0) reasons.push('no tier assigned');

  const dupOf = context.duplicateOf;
  if (dupOf) reasons.push(`duplicate identity of ${dupOf}`);

  let status = COMPONENT_STATUS.ACTIVE;
  let suggestedAction = 'none';

  if (dupOf) { status = COMPONENT_STATUS.DUPLICATE; suggestedAction = 'link to canonical record, then retire'; }
  else if (PLACEHOLDER_NAME.test(name) && item?.price === 0) { status = COMPONENT_STATUS.TEST; suggestedAction = 'remove from selection lists, then delete after review'; }
  else if (PLACEHOLDER_NAME.test(name) || (item?.price === 0 && !isConsumable)) { status = COMPONENT_STATUS.PENDING_REVIEW; suggestedAction = 'complete the record or retire it'; }
  else if (SLOPPY_NAME.test(name) || (!isConsumable && !item?.brand)) { status = COMPONENT_STATUS.PENDING_REVIEW; suggestedAction = 'confirm this is a real product and complete brand/model'; }

  return { status, reasons, suggestedAction };
}

/** Classify the whole catalog. Read-only — returns a report, mutates nothing. */
export function classifyCatalog(catalog) {
  const report = [];
  for (const [categoryKey, cat] of Object.entries(catalog?.categories || {})) {
    for (const item of cat.items || []) {
      const c = classifyCatalogItem(categoryKey, item);
      if (c.status !== COMPONENT_STATUS.ACTIVE)
        report.push({ categoryKey, componentId: item.id, name: item.name,
          price: item.price, tiers: item.tiers, ...c });
    }
  }
  const counts = report.reduce((a, r) => (a[r.status] = (a[r.status] || 0) + 1, a), {});
  const total = Object.values(catalog?.categories || {}).reduce((s, c) => s + (c.items || []).length, 0);
  return { total, flagged: report.length, counts, items: report };
}

/** Would excluding non-ACTIVE items leave a category+tier with no candidate? */
export function findExclusionGaps(catalog, tiers = ['base', 'value', 'premium']) {
  const gaps = [];
  for (const [categoryKey, cat] of Object.entries(catalog?.categories || {})) {
    for (const tier of tiers) {
      const inTier = (cat.items || []).filter(i => (i.tiers || []).includes(tier));
      if (!inTier.length) continue;
      const active = inTier.filter(i => classifyCatalogItem(categoryKey, i).status === COMPONENT_STATUS.ACTIVE);
      if (!active.length)
        gaps.push({ categoryKey, tier, wouldLose: inTier.map(i => `${i.id}:${i.name}`),
          impact: `Excluding non-ACTIVE items leaves tier "${tier}" with no ${categoryKey} at all.` });
    }
  }
  return gaps;
}
