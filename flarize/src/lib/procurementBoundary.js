/**
 * PROCUREMENT / ENGINEERING BOUNDARY.  (Phase 1D §12)
 *
 * Procurement owns commercial data. Engineering owns technical identity and
 * compatibility. A price change must never alter engineering selection.
 *
 * BOUNDARY: field ownership. Enforces who may write what.
 */

export const PROCUREMENT_OWNED_FIELDS = [
  'purchasePrice', 'sellingPrice', 'supplier', 'supplierReference',
  'purchaseDate', 'latestPurchasePrice', 'availability', 'procurementStatus',
  'leadTimeDays', 'datasheetUrl',
];

export const ENGINEERING_OWNED_FIELDS = [
  'brand', 'model', 'batteryType', 'chemistry',
  'nominalVoltage', 'minVoltage', 'maxVoltage',
  'capacityKwh', 'usableCapacityKwh',
  'continuousChargeCurrent', 'continuousDischargeCurrent',
  'maximumChargeCurrent', 'maximumDischargeCurrent', 'peakCurrent',
  'integratedProtection', 'protectionType', 'protectionRating', 'externalProtectionRequired',
  'communicationProtocol', 'communicationRequired',
  'compatibleInverters', 'compatibleSystemTypes', 'compatiblePhases',
  'engineeringStatus', 'tiers', 'phase', 'type',
];

/** Fields that, if changed, would alter engineering selection or BOM architecture. */
export const SELECTION_AFFECTING_FIELDS = [
  ...ENGINEERING_OWNED_FIELDS.filter(f => f !== 'engineeringStatus'),
  'engineeringStatus',
];

export function canWriteField(actorRole, field) {
  if (actorRole === 'ADMIN') return true;
  if (actorRole === 'PROCUREMENT') return PROCUREMENT_OWNED_FIELDS.includes(field);
  if (actorRole === 'PROJECT_HEAD' || actorRole === 'PROJECT_ENGINEER')
    return ENGINEERING_OWNED_FIELDS.includes(field);
  return false;
}

/** Validate a proposed patch. Rejects cross-boundary writes with a reason. */
export function validateFieldWrite(actorRole, patch = {}) {
  const rejected = [], accepted = [];
  for (const f of Object.keys(patch)) (canWriteField(actorRole, f) ? accepted : rejected).push(f);
  return {
    allowed: rejected.length === 0, accepted, rejected,
    reason: rejected.length
      ? `${actorRole} may not write: ${rejected.join(', ')}. ` +
        `Procurement owns commercial data; Engineering owns technical identity and compatibility.`
      : null,
  };
}

/** Does this patch change anything that affects engineering selection? */
export function affectsEngineeringSelection(patch = {}) {
  const hits = Object.keys(patch).filter(f => SELECTION_AFFECTING_FIELDS.includes(f));
  return { affects: hits.length > 0, fields: hits };
}

/**
 * A Procurement price change is commercially significant and engineering-neutral.
 * Returns the effect explicitly so callers cannot conflate the two.
 */
export function classifyProcurementChange(patch = {}) {
  const eng = affectsEngineeringSelection(patch);
  const commercial = Object.keys(patch).some(f => ['purchasePrice', 'sellingPrice', 'latestPurchasePrice'].includes(f));
  const availability = Object.keys(patch).some(f => ['procurementStatus', 'availability'].includes(f));
  return {
    changesCost: commercial,
    changesEngineeringSelection: eng.affects,
    changesFutureAvailability: availability,
    rewritesLockedProjectBoms: false,   // never, by construction
    note: availability
      ? 'Availability change affects NEW projects only. Existing locked project BOMs are unaffected.'
      : commercial
        ? 'Price change affects COST for new quotations only. Engineering selection and locked BOMs are unaffected.'
        : null,
  };
}
