/**
 * Canonical persisted BOM-state shape.  (Phase 0 hotfix H2)
 *
 * ONE definition of what "saved BOM configuration" means, shared by:
 *   - the dirty-state comparator
 *   - the load path (server payload -> baseline)
 *   - the save path (snapshot -> server)
 *
 * Everything NOT in PERSISTED_KEYS is excluded from the comparison:
 *   - `savedAt` and any timestamp        (server-generated metadata)
 *   - session tokens / auth state         (never persisted here)
 *   - transient UI state                  (open panels, tabs, messages)
 *   - calculated/display state            (totals, BOM lines, spec tables)
 *
 * Root cause this fixes: the load path stored the raw server object, which
 * carries `savedAt`; `getBomStateSnapshot()` never emits `savedAt`; the
 * comparator was a raw JSON.stringify equality, so the two could never match
 * and `bomDirty` was permanently true from the moment of login.
 *
 * NOTE: this module is intentionally dependency-free and pure so it can be
 * unit tested without React or a browser.
 */

/** The authoritative list of persisted configuration fields. */
export const PERSISTED_KEYS = [
  // BOM selections and overrides
  'selections', 'qtyOverrides', 'priceOverrides', 'customItems',
  'upgradeSelections', 'upgradeQtyOverrides', 'upgradePriceOverrides', 'upgradeCustomItems',
  // System configuration
  'sysType', 'size', 'tier', 'mode', 'roofType', 'housePhase',
  // Cost / commercial inputs
  'distKm', 'costOvr', 'marginType', 'marginVal',
  'subsidyType', 'ghsHouses', 'structGrade', 'structGradeMode',
  // Upgrade configuration
  'upgradeFromKw', 'upgradeToKw', 'upgradePhase', 'upgradeTier', 'upgradeSections',
  // Add-ons and micro-inverter options
  'addOns', 'upgradeAddOns', 'microBrand', 'zeroExport',
  // Future upgrade
  'futureUpgrade', 'upgradeSize', 'fuOpts',
  // Customer / quotation inputs
  'custName', 'custPhone', 'custAddress', 'salesPerson', 'selectedOffer',
  // Display preferences that are genuinely persisted
  'panelTypeFilter', 'quotationViewMode', 'lang',
];

/** Fields explicitly excluded from dirty comparison. Documented, not implicit. */
export const EXCLUDED_KEYS = ['savedAt', 'updatedAt', 'createdAt', 'token', 'sessionToken', '_meta'];

/**
 * Deterministic stringify: object keys sorted at every depth, so two
 * structurally-equal objects always produce the same string regardless of
 * the order their keys happened to be inserted in.
 */
export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
}

/**
 * Normalise a value for comparison.
 * Numeric-looking strings are compared as numbers, because number inputs hand
 * back strings ("20") while the persisted file holds numbers (20). Without
 * this, merely focusing a numeric field would mark the state dirty.
 */
function normaliseValue(v) {
  if (v === undefined) return null;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  if (Array.isArray(v)) return v.map(normaliseValue);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = normaliseValue(v[k]);
    return out;
  }
  return v;
}

/**
 * Project any object (a server payload or a live snapshot) onto the canonical
 * persisted shape. Missing keys become null so the two sides always have the
 * same key set.
 */
export function canonicalState(obj) {
  const src = obj || {};
  const out = {};
  for (const key of PERSISTED_KEYS) out[key] = normaliseValue(src[key]);
  return out;
}

/** Canonical string form, for equality checks and hashing. */
export function canonicalString(obj) {
  return stableStringify(canonicalState(obj));
}

/**
 * True when `current` differs from `saved` in any persisted field.
 * `saved === null` means "not loaded yet" and is never dirty.
 */
export function isDirty(current, saved) {
  if (saved === null || saved === undefined) return false;
  return canonicalString(current) !== canonicalString(saved);
}

/**
 * Which persisted fields differ. Used by the UI to explain *what* is unsaved
 * instead of only asserting that something is.
 */
export function diffKeys(current, saved) {
  if (saved === null || saved === undefined) return [];
  const a = canonicalState(current);
  const b = canonicalState(saved);
  return PERSISTED_KEYS.filter(k => stableStringify(a[k]) !== stableStringify(b[k]));
}
