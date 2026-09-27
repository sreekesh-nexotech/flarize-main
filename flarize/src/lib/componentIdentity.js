/**
 * CANONICAL COMPONENT IDENTITY.  (Phase 1A)
 *
 * A component is identified by `componentId` — never by display name.
 * The same componentId must flow unchanged through:
 *   Package -> BOM -> Cost -> Quotation -> Project BOM -> Procurement
 *
 * Name-based lookup is the root of two live defects:
 *   - `find('System Controller')` matches a ₹110,000 row when a ₹25,000 row
 *     was intended (first match wins, decided by catalog array order)
 *   - the premium battery was matched by the substring "Flex Battery"
 *
 * BOUNDARY: identity only. No price, no validity, no presentation.
 */

export const COMPONENT_STATUS = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  TEST: 'TEST',
  DUPLICATE: 'DUPLICATE',
  PENDING_REVIEW: 'PENDING_REVIEW',
};

/** Statuses permitted in production selection lists. */
export const SELECTABLE_STATUSES = [COMPONENT_STATUS.ACTIVE];

/**
 * Project a raw catalog item onto the canonical identity shape.
 * `status` defaults to ACTIVE so untagged legacy data keeps working.
 */
export function toComponent(categoryKey, item) {
  if (!item) return null;
  return {
    componentId: item.id,
    category: categoryKey,
    brand: item.brand || null,
    model: item.model || null,
    name: item.name || null,          // display only — never identity
    specification: buildSpec(categoryKey, item),
    unit: item.unit || defaultUnit(categoryKey),
    status: item.status || COMPONENT_STATUS.ACTIVE,
    active: (item.status || COMPONENT_STATUS.ACTIVE) === COMPONENT_STATUS.ACTIVE,
    tiers: Array.isArray(item.tiers) ? item.tiers : [],
    price: item.price ?? null,        // procurement concern; carried, not owned
    raw: item,
  };
}

/** All components in the catalog, flattened, with identity applied. */
export function allComponents(catalog) {
  const out = [];
  for (const [key, cat] of Object.entries(catalog?.categories || {})) {
    for (const item of cat.items || []) out.push(toComponent(key, item));
  }
  return out;
}

/** Look up strictly by componentId. The only sanctioned lookup. */
export function findByComponentId(catalog, componentId) {
  if (!componentId) return null;
  for (const [key, cat] of Object.entries(catalog?.categories || {})) {
    const hit = (cat.items || []).find(i => i.id === componentId);
    if (hit) return toComponent(key, hit);
  }
  return null;
}

/** True when the component may appear in a production selection list. */
export function isSelectable(component) {
  if (!component) return false;
  return SELECTABLE_STATUSES.includes(component.status) && component.tiers.length > 0;
}

/** Duplicate identities: same category + brand + model, different ids. */
export function findDuplicateIdentities(catalog) {
  const seen = new Map();
  for (const c of allComponents(catalog)) {
    const key = [c.category, (c.brand || '').toLowerCase().trim(),
                 (c.model || c.name || '').toLowerCase().trim()].join('|');
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key).push(c.componentId);
  }
  return [...seen.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([key, ids]) => ({ key, componentIds: ids }));
}

function buildSpec(categoryKey, item) {
  const bits = [];
  if (item.watt) bits.push(`${item.watt}W`);
  if (item.kw) bits.push(`${item.kw}kW`);
  if (item.kwh) bits.push(`${item.kwh}kWh`);
  if (item.phase) bits.push(item.phase);
  if (item.sqmm) bits.push(`${item.sqmm}sqmm`);
  if (item.panelType) bits.push(item.panelType);
  if (item.mpptCount) bits.push(`${item.mpptCount} MPPT`);
  return bits.join(' · ') || null;
}

function defaultUnit(categoryKey) {
  if (/cable|conductor/.test(categoryKey)) return 'm';
  return 'nos';
}
