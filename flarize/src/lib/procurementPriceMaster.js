/**
 * PROCUREMENT PRICE MASTER.  (Phase 2A final — §1, §2, §18)
 *
 * Every procurement-managed component carries TWO separate commercial values:
 *
 *   purchasePrice     what the supplier charges.        Procurement + audit.
 *   landedUnitCost    what the component actually costs us once it is in our
 *                     warehouse. THIS is what the Cost Engine consumes.
 *
 * They are never merged, never overwritten by each other, and neither is ever
 * overwritten by a customer selling price.
 *
 * NO FREIGHT ALLOCATION IS COMPUTED HERE.
 *   The system does NOT derive landedUnitCost from purchasePrice by any rule —
 *   not by weight, quantity, value or volume. Procurement determines the actual
 *   landed cost per component and enters it. A missing landed cost is a missing
 *   fact, and the Cost Engine blocks on it.
 *
 * There is NO component-level selling price in V1 (§18). Selling price exists
 * only at project level, in the Pricing Engine.
 */

import { isMoney } from './money.js';

export const PRICE_KIND = {
  PURCHASE_PRICE: 'PURCHASE_PRICE',
  LANDED_UNIT_COST: 'LANDED_UNIT_COST',
  REFERENCE_PRICE: 'REFERENCE_PRICE',
  UNKNOWN: 'UNKNOWN',
};

/** The ONLY kind admissible as project material cost. */
export const VALID_FOR_PROJECT_COST = [PRICE_KIND.LANDED_UNIT_COST];

/** A component-level selling price is deliberately NOT part of this model. */
export const FORBIDDEN_PRICE_KINDS = ['SELLING_PRICE', 'CUSTOMER_PRICE', 'MARKET_RATE'];

export const PRICE_RECORD_FIELDS = [
  'componentId', 'componentName',
  'purchasePrice', 'purchasePriceVersion', 'purchasePriceEffectiveFrom',
  'landedUnitCost', 'landedCostVersion', 'landedCostEffectiveFrom',
  'supplier', 'supplierReference', 'currency', 'notes',
];

/**
 * Normalise a raw procurement record. Nothing is derived, nothing is defaulted
 * to a number. Absent facts stay null and are reported.
 */
export function toPriceRecord(raw = {}) {
  const out = {};
  for (const f of PRICE_RECORD_FIELDS) out[f] = raw[f] !== undefined ? raw[f] : null;
  out.currency = raw.currency || 'INR';

  for (const k of FORBIDDEN_PRICE_KINDS)
    if (raw[k] !== undefined || raw[camel(k)] !== undefined)
      out.violation = `A component-level ${k} is not part of the V1 model (§18). ` +
        'Procurement owns purchasePrice and landedUnitCost; project selling price belongs to the Pricing Engine.';

  out.hasPurchasePrice = isMoney(out.purchasePrice);
  out.hasLandedCost = isMoney(out.landedUnitCost);
  // Landed cost is NEVER inferred from purchase price.
  out.landedCostSource = out.hasLandedCost ? 'PROCUREMENT_ENTERED' : null;
  out.missing = PRICE_RECORD_FIELDS.filter(f => out[f] === null);
  return out;
}

/** Build a lookup from a raw price-master object keyed by componentId. */
export function buildPriceMaster(raw = {}) {
  const out = {};
  for (const [id, rec] of Object.entries(raw)) out[id] = toPriceRecord({ componentId: id, ...rec });
  return out;
}

/**
 * What the Cost Engine may use for one component.
 * Returns { ok, unitCost, kind, reason }.
 */
export function projectUnitCost(record) {
  if (!record) return { ok: false, unitCost: null, kind: PRICE_KIND.UNKNOWN,
    reason: 'No procurement price record for this component.' };
  if (record.violation) return { ok: false, unitCost: null, kind: PRICE_KIND.UNKNOWN, reason: record.violation };
  if (!record.hasLandedCost)
    return { ok: false, unitCost: null, kind: PRICE_KIND.UNKNOWN,
      reason: record.hasPurchasePrice
        ? 'landedUnitCost is not recorded. The purchase price must NOT be substituted for it — ' +
          'procurement-side logistics, handling and warehousing are not included in the supplier price ' +
          'and are never derived by the system.'
        : 'Neither landedUnitCost nor purchasePrice is recorded.' };
  return { ok: true, unitCost: Number(record.landedUnitCost), kind: PRICE_KIND.LANDED_UNIT_COST, reason: null };
}

/** Difference between what we pay the supplier and what the component costs us. */
export function procurementUplift(record) {
  if (!record?.hasLandedCost || !record?.hasPurchasePrice) return null;
  const delta = Number(record.landedUnitCost) - Number(record.purchasePrice);
  return { purchasePrice: Number(record.purchasePrice), landedUnitCost: Number(record.landedUnitCost),
    delta, pctOfPurchase: Number(record.purchasePrice) === 0 ? null : (delta / Number(record.purchasePrice)) * 100 };
}

function camel(s) { return s.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase()); }
