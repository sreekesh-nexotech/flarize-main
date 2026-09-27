/**
 * BATTERY MASTER DATA MODEL.  (Phase 1D)
 *
 * The battery is NOT hard-coded to SEG, Deye or any single product.
 * Procurement maintains the catalog; Engineering approves; Project Head selects.
 *
 * NO TECHNICAL SPECIFICATION IS FABRICATED. Every field the source does not
 * contain is `null`, and `engineeringStatus` records that the data is missing.
 *
 * BOUNDARY: master data shape + lifecycle. Selects nothing, prices nothing,
 * validates nothing.
 */

/** Engineering lifecycle. A Procurement addition is NOT immediately selectable. */
export const ENGINEERING_STATUS = {
  DRAFT: 'DRAFT',
  PENDING_ENGINEERING_APPROVAL: 'PENDING_ENGINEERING_APPROVAL',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  WITHDRAWN: 'WITHDRAWN',
};

/** Commercial availability. Owned by Procurement. */
export const PROCUREMENT_STATUS = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  DISCONTINUED: 'DISCONTINUED',
  PENDING_SOURCING: 'PENDING_SOURCING',
};

/** Battery-side protection topology. */
export const BATTERY_PROTECTION_MODE = {
  INTEGRATED: 'INTEGRATED',
  EXTERNAL_REQUIRED: 'EXTERNAL_REQUIRED',
  EXTERNAL_OPTIONAL: 'EXTERNAL_OPTIONAL',
  UNKNOWN: 'UNKNOWN',
};

/** Full master-data field list. Anything absent from source resolves to null. */
export const BATTERY_FIELDS = [
  'componentId', 'brand', 'model', 'displayName', 'batteryType', 'chemistry',
  'nominalVoltage', 'minVoltage', 'maxVoltage',
  'capacityKwh', 'usableCapacityKwh',
  'continuousChargeCurrent', 'continuousDischargeCurrent',
  'maximumChargeCurrent', 'maximumDischargeCurrent', 'peakCurrent',
  'integratedProtection', 'protectionType', 'protectionRating', 'externalProtectionRequired',
  'communicationProtocol', 'communicationRequired',
  'compatibleInverters', 'compatibleSystemTypes', 'compatiblePhases',
  'purchasePrice', 'sellingPrice', 'supplier', 'supplierReference', 'datasheetUrl',
  'engineeringStatus', 'procurementStatus', 'createdAt', 'updatedAt',
];

/** Electrical fields required before a battery can be validated automatically. */
export const REQUIRED_FOR_VALIDATION = [
  'nominalVoltage', 'capacityKwh', 'maximumDischargeCurrent', 'integratedProtection',
];

/** Fields required before a BOM can be safely ISSUED. Missing -> BLOCKED. */
export const REQUIRED_FOR_SAFE_ISSUE = ['integratedProtection'];

/**
 * Project a raw catalog row + any master-data overlay onto the master shape.
 * Values that do not exist stay null. Nothing is inferred from the display name.
 */
export function toBatteryMaster(item, overlay = {}) {
  if (!item) return null;
  const src = { ...item, ...overlay };
  const out = {};
  for (const f of BATTERY_FIELDS) out[f] = src[f] !== undefined ? src[f] : null;
  out.componentId = item.id || src.componentId || null;
  out.brand = src.brand || null;
  out.displayName = src.displayName || src.name || null;
  out.model = src.model || null;
  out.purchasePrice = src.purchasePrice !== undefined && src.purchasePrice !== null
    ? src.purchasePrice : (src.price ?? null);
  out.engineeringStatus = src.engineeringStatus || ENGINEERING_STATUS.PENDING_ENGINEERING_APPROVAL;
  out.procurementStatus = src.procurementStatus || PROCUREMENT_STATUS.ACTIVE;
  for (const k of ['compatibleInverters', 'compatibleSystemTypes', 'compatiblePhases'])
    if (out[k] !== null && !Array.isArray(out[k])) out[k] = null;
  out.tiers = Array.isArray(item.tiers) ? item.tiers : [];
  out.missingFields = BATTERY_FIELDS.filter(f => out[f] === null);
  out.missingForValidation = REQUIRED_FOR_VALIDATION.filter(f => out[f] === null);
  out.missingForSafeIssue = REQUIRED_FOR_SAFE_ISSUE.filter(f => out[f] === null);
  return out;
}

/** All batteries as master records. Overlay is keyed by componentId. */
export function allBatteries(catalog, masterOverlay = {}) {
  return (catalog?.categories?.battery?.items || [])
    .map(i => toBatteryMaster(i, masterOverlay[i.id] || {}));
}

/** Engineering-approved AND commercially available. */
export function isSelectable(b) {
  if (!b) return false;
  if (b.engineeringStatus !== ENGINEERING_STATUS.APPROVED) return false;
  if (b.procurementStatus === PROCUREMENT_STATUS.INACTIVE ||
      b.procurementStatus === PROCUREMENT_STATUS.DISCONTINUED) return false;
  if (b.status && b.status !== 'ACTIVE') return false;
  return true;
}

/**
 * PERMANENTLY unselectable: the record may never appear in a BOM again.
 *
 * A DIFFERENT gate from `isSelectable`. A battery awaiting engineering approval
 * is not freely selectable, but it must NOT be erased from a BOM that already
 * uses it — deleting it would ship a hybrid system with no battery, which is
 * exactly defect D1 that Phase 1C fixed. Such a battery stays in the BOM and
 * the configuration is BLOCKED by validation instead.
 */
export function isPermanentlyUnselectable(b) {
  if (!b) return true;
  if (b.engineeringStatus === ENGINEERING_STATUS.REJECTED ||
      b.engineeringStatus === ENGINEERING_STATUS.WITHDRAWN) return true;
  if (b.procurementStatus === PROCUREMENT_STATUS.INACTIVE ||
      b.procurementStatus === PROCUREMENT_STATUS.DISCONTINUED) return true;
  if (b.status && b.status !== 'ACTIVE') return true;
  return false;
}

/** Why a battery is not selectable. Never silently hidden. */
export function selectabilityReason(b) {
  if (!b) return 'component not found';
  if (b.engineeringStatus !== ENGINEERING_STATUS.APPROVED)
    return `engineeringStatus is ${b.engineeringStatus} — a Procurement addition is not selectable until Engineering approves it`;
  if (b.procurementStatus === PROCUREMENT_STATUS.INACTIVE) return 'procurementStatus is INACTIVE';
  if (b.procurementStatus === PROCUREMENT_STATUS.DISCONTINUED) return 'procurementStatus is DISCONTINUED';
  return null;
}
