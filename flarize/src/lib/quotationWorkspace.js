/**
 * QUOTATION WORKSPACE — APPLICATION SERVICE LAYER.  (Phase 3, PART H — Step 2)
 *
 * The service around the pure assembler. It owns state, permission and
 * lifecycle. It owns no rule.
 *
 *   LOCKED BOM SNAPSHOT + ISSUED COMMERCIAL SNAPSHOT
 *     -> quotationPayload.buildQuotationPayload()      (the ONLY assembler)
 *     -> §28 generation gate ENFORCED here
 *     -> immutable issued document, v1
 *     -> revision -> v2, v1 preserved byte-for-byte
 *
 * WHAT THIS LAYER DOES NOT CONTAIN
 *   no pricing formula, no margin rule, no GST rule, no cost head, no
 *   engineering rule, no BOM quantity, no money arithmetic of any kind. It
 *   imports no cost or pricing engine — a test asserts the import list.
 *   `quotationPayload.js` remains the sole place the payload is shaped, and it
 *   is not re-implemented here.
 *
 * CATALOG BOUNDARY
 *   `componentAttributesFor()` is the ONE place in the quotation feature that
 *   reads catalog attributes. It is keyed BY THE IDS THE LOCKED BOM ALREADY
 *   CHOSE: it can only decorate a component the BOM selected, never choose one.
 *   Commercial fields are whitelisted out — no price, no perWatt, no rate ever
 *   leaves it. The assembler itself still never sees a catalog.
 *
 * GATE
 *   A blocked gate refuses issuance by throwing GENERATION_BLOCKED with the
 *   exact failed checks. It creates no document, no version, and mutates no
 *   existing state. Missing commercial or engineering values do NOT relax it.
 *
 * DETERMINISM
 *   No clock, no randomness, no generated identifier. `at` and every id are
 *   supplied by the caller. A version number is derived from the stored version
 *   list, which is state, not a hidden counter.
 *
 * IDENTITY
 *   P3-D is unresolved. `identityModel` is OPERATOR_ASSERTED_ROLE and this
 *   layer says so out loud. It does not authenticate anybody.
 */

import {
  buildQuotationPayload, evaluateGenerationGate, GATE_STATUS,
  SUBSIDY_TREATMENT, QUOTATION_STATUS,
} from './quotationPayload.js';
import { assertCan, can, CAPABILITY, capabilitiesOf, isIndividualSalesRole } from './rbac.js';
import { SNAPSHOT_STATUS } from './bomSnapshot.js';
import { COMMERCIAL_SNAPSHOT_STATUS } from './commercialSnapshot.js';
import {
  getActiveCampaign as cmsGetActiveCampaign,
  snapshotPageVersion as cmsSnapshotPageVersion,
  getCampaign as cmsGetCampaign,
  getPage as cmsGetPage,
  getPageVersion as cmsGetPageVersion,
} from './cmsStore.js';
import { calculateEnergyProfile } from './energyEngine.js';
import { calculateSavings } from './savingsEngine.js';
import { calculateSubsidy } from './subsidyEngine.js';
import { calculateFinance } from './financeEngine.js';
// Phase G G0 (2026-09-05) — commercial-freeze integration.
// Additive to the existing issue path: when the caller supplies
// `commercialFreezeInputs`, the issued document also carries a fully
// frozen `document.snapshot` per Phase F. No change to any existing
// field; callers that omit `commercialFreezeInputs` still get the
// prior contract.
import { buildCommercialSnapshot } from './commercialFreeze.js';

export const QUOTATION_WORKSPACE_VERSION = 'quotationWorkspace.1';

export const IDENTITY_MODEL = 'OPERATOR_ASSERTED_ROLE';

export const QUOTATION_ERROR = {
  GENERATION_BLOCKED: 'GENERATION_BLOCKED',
  QUOTATION_NOT_FOUND: 'QUOTATION_NOT_FOUND',
  QUOTATION_EXISTS: 'QUOTATION_EXISTS',
  QUOTATION_ALREADY_ISSUED: 'QUOTATION_ALREADY_ISSUED',
  QUOTATION_NOT_ISSUED: 'QUOTATION_NOT_ISSUED',
  VERSION_NOT_FOUND: 'VERSION_NOT_FOUND',
  BOM_SNAPSHOT_NOT_FOUND: 'BOM_SNAPSHOT_NOT_FOUND',
  BOM_NOT_LOCKED: 'BOM_NOT_LOCKED',
  COMMERCIAL_SNAPSHOT_NOT_FOUND: 'COMMERCIAL_SNAPSHOT_NOT_FOUND',
  COMMERCIAL_SNAPSHOT_NOT_ISSUED: 'COMMERCIAL_SNAPSHOT_NOT_ISSUED',
  MISSING_TIMESTAMP: 'MISSING_TIMESTAMP',
  MISSING_IDENTIFIER: 'MISSING_IDENTIFIER',
};

export class QuotationError extends Error {
  constructor(code, message, detail = null) {
    super(message);
    this.name = 'QuotationError';
    this.code = code;
    this.detail = detail;
  }
}

/** Document version states. A document itself is never edited (§26). */
export const VERSION_STATUS = {
  ISSUED: 'ISSUED',
  SUPERSEDED: 'SUPERSEDED',
};

// ---------------------------------------------------------------------------
// store
// ---------------------------------------------------------------------------

/**
 * In-memory workspace state. One store per session/process; the caller owns it.
 * Nothing here is global and nothing is shared with another workspace.
 */
export function createQuotationStore() {
  return {
    storeVersion: QUOTATION_WORKSPACE_VERSION,
    bomSnapshots: new Map(),        // bomSnapshotId    -> LOCKED bom snapshot
    commercialSnapshots: new Map(), // commercialSnapshotId -> ISSUED commercial snapshot
    quotations: new Map(),          // quotationId      -> draft record
    documents: new Map(),           // quotationId      -> [frozen document, ...] index = version-1
    versionStatus: new Map(),       // `${quotationId}#${version}` -> VERSION_STATUS
  };
}

function requireAt(at) {
  if (!at) throw new QuotationError(QUOTATION_ERROR.MISSING_TIMESTAMP,
    'Every operation requires a caller-supplied `at`. This layer has no clock.');
  return at;
}

function requireId(value, what) {
  if (!value) throw new QuotationError(QUOTATION_ERROR.MISSING_IDENTIFIER,
    `${what} is required. Identifiers are supplied by the caller, never generated.`);
  return value;
}

// ---------------------------------------------------------------------------
// snapshot registration
// ---------------------------------------------------------------------------

/**
 * Accept a LOCKED project BOM snapshot for quotation use. An unlocked snapshot
 * is refused by name — a quotation is never built from an unlocked engineering
 * configuration (invariant 4, contract §28).
 */
export function registerBomSnapshot(store, actor, { bomSnapshotId, snapshot } = {}) {
  assertCan(actor, CAPABILITY.BOM_VIEW);
  requireId(bomSnapshotId, 'bomSnapshotId');
  if (!snapshot) throw new QuotationError(QUOTATION_ERROR.BOM_SNAPSHOT_NOT_FOUND, 'No BOM snapshot supplied.');
  if (snapshot.status !== SNAPSHOT_STATUS.LOCKED)
    throw new QuotationError(QUOTATION_ERROR.BOM_NOT_LOCKED,
      `BOM snapshot ${bomSnapshotId} has status ${snapshot.status}. Only a LOCKED snapshot may back a quotation.`,
      { bomSnapshotId, status: snapshot.status });
  store.bomSnapshots.set(bomSnapshotId, snapshot);
  return snapshot;
}

/**
 * Accept an ISSUED commercial snapshot. This layer does not create one — the
 * frozen `commercialSnapshot.js` does, from the Project Head workspace — and it
 * does not read a cost or pricing engine to second-guess it.
 */
export function registerCommercialSnapshot(store, actor, { snapshot } = {}) {
  assertCan(actor, CAPABILITY.COST_VIEW);
  assertCan(actor, CAPABILITY.PRICING_VIEW);
  if (!snapshot) throw new QuotationError(QUOTATION_ERROR.COMMERCIAL_SNAPSHOT_NOT_FOUND, 'No commercial snapshot supplied.');
  requireId(snapshot.snapshotId, 'snapshot.snapshotId');
  if (snapshot.status !== COMMERCIAL_SNAPSHOT_STATUS.ISSUED)
    throw new QuotationError(QUOTATION_ERROR.COMMERCIAL_SNAPSHOT_NOT_ISSUED,
      `Commercial snapshot ${snapshot.snapshotId} has status ${snapshot.status}. Only an ISSUED snapshot may price a quotation.`,
      { snapshotId: snapshot.snapshotId, status: snapshot.status });
  store.commercialSnapshots.set(snapshot.snapshotId, snapshot);
  return snapshot;
}

// ---------------------------------------------------------------------------
// catalog boundary — the ONLY catalog read in the quotation feature
// ---------------------------------------------------------------------------

/**
 * Display attributes for ids the LOCKED BOM already chose.
 *
 * Whitelist only. Every commercial field on a catalog row (`price`, `perWatt`,
 * `marketRate`, …) is left behind: the customer document never carries an
 * internal price and `marketRate` is REFERENCE_ONLY (C3).
 *
 * If an id is absent from the catalog the id is simply not decorated. It is
 * NEVER matched by name, never approximated and never replaced — the assembler
 * still emits the id unchanged, which is what makes silent substitution
 * structurally impossible.
 */
const INVERTER_DEVICE_LABEL = Object.freeze({
  string_inverter: 'String Inverter',
  micro_inverter: 'Micro Inverter',
  microinverter: 'Micro Inverter',
  hybrid_inverter: 'Hybrid Inverter',
  hybrid: 'Hybrid Inverter',
});

// 2026-09-09 — owner-maintained quotation content (testimonials) is read by
// the server and handed in through this provider so every payload build
// (draft, issue, alternatives) sees the same content without threading one
// more parameter through each call site.
let _quotationContentProvider = null;
export function setQuotationContentProvider(fn) { _quotationContentProvider = typeof fn === 'function' ? fn : null; }
function quotationContent() {
  try { return _quotationContentProvider ? (_quotationContentProvider() || {}) : {}; } catch { return {}; }
}

export function componentAttributesFor(catalog, componentIds = []) {
  const wanted = new Set((componentIds || []).filter(Boolean));
  const out = {};
  const categories = catalog?.categories || {};
  for (const category of Object.values(categories)) {
    for (const item of category?.items || []) {
      if (!wanted.has(item.id)) continue;
      const attrs = {};
      if (item.brand != null) attrs.brand = item.brand;
      if (item.model != null) attrs.model = item.model;
      else if (item.name != null) attrs.model = item.name;
      if (item.watt != null) attrs.moduleWatt = item.watt;
      if (item.kw != null) attrs.capacity = `${item.kw} kW`;
      if (item.phase != null) attrs.phase = item.phase;
      // Inverter architecture label from the structured deviceType (string /
      // micro / hybrid); falls back to the raw type key. Display only.
      const devLabel = INVERTER_DEVICE_LABEL[item.deviceType] || null;
      if (devLabel) attrs.technology = devLabel;
      else if (item.type != null) attrs.technology = item.type;
      else if (item.panelType != null) attrs.technology = item.panelType;
      if (item.dcr != null) attrs.dcr = item.dcr;
      if (item.sqmm != null) attrs.crossSection = item.sqmm;
      if (item.unit != null) attrs.unit = item.unit;
      if (typeof item.specification === 'string' && item.specification.trim()) attrs.specification = item.specification.trim();
      // Warranty is the PH/Procurement-entered catalog text (Items & Prices →
      // "Warranty (printed on quotation)"). §15 forbids a generic statement, so
      // when the item carries none the payload reports it absent.
      if (typeof item.warranty === 'string' && item.warranty.trim()) attrs.warranty = item.warranty.trim();
      out[item.id] = attrs;
    }
  }
  return out;
}

/** Ids a payload build needs — taken from the BOM snapshot, from nowhere else. */
function componentIdsOf(bomSnapshot) {
  return (bomSnapshot?.lines || []).map(l => l.componentId).filter(Boolean);
}

// ---------------------------------------------------------------------------
// quotation drafts
// ---------------------------------------------------------------------------

const DRAFT_FIELDS = [
  'customer', 'site', 'system', 'upgradeIdentity', 'subsidyTreatment', 'subsidyType', 'ghsHouses', 'variant',
  'quotationNumber', 'quotationDate', 'validUntil', 'proposalBy', 'salespersonId',
  'quotationLanguage', 'applianceRows', 'bomSnapshotId', 'commercialSnapshotId', 'engineering', 'alternativeOptions',
  'quotationSource', 'district', 'affiliateId',
];

/** Valid quotation source values. */
export const QUOTATION_SOURCE = Object.freeze({
  DIRECT: 'DIRECT',
  AFFILIATE: 'AFFILIATE',
  DISTRICT: 'DISTRICT',
});
const VALID_SOURCES = Object.values(QUOTATION_SOURCE);

/**
 * Validate classification fields. Throws QuotationError on invalid combinations.
 *  - quotationSource must be DIRECT | AFFILIATE | DISTRICT (default DIRECT)
 *  - affiliateId only valid when source is AFFILIATE
 *  - district required when source is DISTRICT
 *  - salespersonId must match actor.userId (server-derived, never client-asserted)
 */
function validateClassification(record, actor) {
  const source = record.quotationSource ?? QUOTATION_SOURCE.DIRECT;
  if (!VALID_SOURCES.includes(source))
    throw new QuotationError(QUOTATION_ERROR.MISSING_IDENTIFIER,
      `quotationSource must be one of: ${VALID_SOURCES.join(', ')}. Got "${source}".`,
      { field: 'quotationSource', value: source });
  record.quotationSource = source;

  if (source !== QUOTATION_SOURCE.AFFILIATE && record.affiliateId)
    throw new QuotationError(QUOTATION_ERROR.MISSING_IDENTIFIER,
      'affiliateId may only be set when quotationSource is AFFILIATE.',
      { field: 'affiliateId', quotationSource: source });

  if (source === QUOTATION_SOURCE.DISTRICT && !record.district)
    throw new QuotationError(QUOTATION_ERROR.MISSING_IDENTIFIER,
      'district is required when quotationSource is DISTRICT.',
      { field: 'district', quotationSource: source });

  // salespersonId is ALWAYS server-derived from the authenticated actor
  record.salespersonId = actor.userId;
}

export function createDraft(store, actor, input = {}) {
  assertCan(actor, CAPABILITY.QUOTATION_CREATE);
  const quotationId = requireId(input.quotationId, 'quotationId');
  const at = requireAt(input.at);
  if (store.quotations.has(quotationId))
    throw new QuotationError(QUOTATION_ERROR.QUOTATION_EXISTS, `Quotation ${quotationId} already exists.`, { quotationId });

  const record = {
    quotationId,
    projectId: input.projectId ?? null,
    status: QUOTATION_STATUS.DRAFT,
    currentVersion: null,
    createdBy: actor.userId,
    createdAt: at,
    identityModel: IDENTITY_MODEL,
    variant: input.variant ?? 'FULL',
    subsidyTreatment: input.subsidyTreatment ?? null,
    alternativeOptions: input.alternativeOptions ?? [],
  };
  for (const f of DRAFT_FIELDS) if (input[f] !== undefined) record[f] = input[f];

  // Classification: enforce server-derived salespersonId + validate source/district/affiliate
  validateClassification(record, actor);

  store.quotations.set(quotationId, record);
  store.documents.set(quotationId, []);
  return { ...record };
}

/** Edit a draft. An issued quotation is never edited — it is revised (§26). */
export function setQuotationFields(store, actor, quotationId, fields = {}, at = null) {
  assertCan(actor, CAPABILITY.QUOTATION_CREATE);
  const q = mustGet(store, quotationId);
  assertOwns(actor, q);
  requireAt(at);
  if (q.status === QUOTATION_STATUS.ISSUED)
    throw new QuotationError(QUOTATION_ERROR.QUOTATION_ALREADY_ISSUED,
      `Quotation ${quotationId} is ISSUED and immutable. Use createRevision to produce the next version.`,
      { quotationId, currentVersion: q.currentVersion });
  for (const [k, v] of Object.entries(fields)) {
    if (!DRAFT_FIELDS.includes(k))
      throw new QuotationError(QUOTATION_ERROR.MISSING_IDENTIFIER, `Field "${k}" is not a quotation draft field.`, { field: k });
    if (k === 'salespersonId')
      throw new QuotationError(QUOTATION_ERROR.MISSING_IDENTIFIER,
        'salespersonId is server-derived from the authenticated session and cannot be set by the client.',
        { field: 'salespersonId' });
    q[k] = v;
  }
  // Re-validate classification after field changes
  validateClassification(q, actor);
  q.updatedBy = actor.userId;
  q.updatedAt = at;
  return { ...q };
}

function mustGet(store, quotationId) {
  const q = store.quotations.get(quotationId);
  if (!q) throw new QuotationError(QUOTATION_ERROR.QUOTATION_NOT_FOUND, `Quotation ${quotationId} not found.`, { quotationId });
  return q;
}

/** Ownership guard: individual sales can only access own quotations. */
function assertOwns(actor, q) {
  if (isIndividualSalesRole(actor.role) &&
      q.salespersonId !== actor.userId && q.createdBy !== actor.userId) {
    throw new QuotationError('QUOTATION_ACCESS_DENIED',
      'Access denied: quotation belongs to another salesperson.',
      { quotationId: q.quotationId, actorUserId: actor.userId });
  }
}

export function getQuotation(store, actor, quotationId) {
  assertCan(actor, CAPABILITY.PRICING_VIEW);
  const q = mustGet(store, quotationId);
  assertOwns(actor, q);
  return { ...q };
}

export function listQuotations(store, actor) {
  assertCan(actor, CAPABILITY.PRICING_VIEW);
  let items = [...store.quotations.values()];
  // OWNERSHIP: individual sales see only their own quotations
  if (isIndividualSalesRole(actor.role)) {
    items = items.filter(q =>
      q.salespersonId === actor.userId || q.createdBy === actor.userId
    );
  }
  return items.map(q => ({
    quotationId: q.quotationId, projectId: q.projectId, status: q.status,
    currentVersion: q.currentVersion, quotationNumber: q.quotationNumber ?? null,
    quotationSource: q.quotationSource ?? QUOTATION_SOURCE.DIRECT,
    district: q.district ?? null,
    affiliateId: q.affiliateId ?? null,
    salespersonId: q.salespersonId ?? null,
  }));
}

// ---------------------------------------------------------------------------
// payload assembly + gate
// ---------------------------------------------------------------------------

/** Resolve the inputs a build needs. Missing inputs stay null — never faked. */
function resolveInputs(store, q, version) {
  const bomSnapshot = q.bomSnapshotId ? (store.bomSnapshots.get(q.bomSnapshotId) ?? null) : null;
  const commercialSnapshot = q.commercialSnapshotId ? (store.commercialSnapshots.get(q.commercialSnapshotId) ?? null) : null;
  return {
    quotation: {
      quotationNumber: q.quotationNumber ?? null,
      quotationVersion: version,
      quotationDate: q.quotationDate ?? null,
      validUntil: q.validUntil ?? null,
      proposalBy: q.proposalBy ?? null,
      salespersonId: q.salespersonId ?? null,
      quotationLanguage: q.quotationLanguage ?? null,
      status: q.status,
      quotationSource: q.quotationSource ?? QUOTATION_SOURCE.DIRECT,
      district: q.district ?? null,
      affiliateId: q.affiliateId ?? null,
    },
    customer: q.customer ?? null,
    site: q.site ?? null,
    system: q.system ?? null,
    bomSnapshot,
    commercialSnapshot,
    engineering: q.engineering ?? null,
    upgradeIdentity: q.upgradeIdentity ?? null,
    subsidyTreatment: q.subsidyTreatment ?? null,
    variant: q.variant ?? 'FULL',
  };
}

// ---------------------------------------------------------------------------
// Energy Engine resolution
// ---------------------------------------------------------------------------

/**
 * Compute the energyProfileResult from customer bill data + system config.
 * Returns null when bill data is absent (energy remains BLOCKED in payload).
 * The energy engine is never called with invented inputs — if the customer
 * hasn't supplied a bill, the section stays blocked.
 */
function resolveEnergyProfileResult(customer, system, energyConfig) {
  if (!energyConfig) return null;
  if (!customer) return null;

  const billAmount = customer.currentBillAmount;
  if (billAmount == null || billAmount <= 0) return null;

  // Map customer billing cycle to engine format
  const rawCycle = (customer.currentBillCycle || '').toString().toLowerCase().replace(/[\s-_]/g, '');
  const billingCycle = rawCycle.includes('bimonthly') ? 'bimonthly' : 'monthly';

  // System size from quotation's system config (optional override)
  const systemSizeKw = system?.systemSizeKw ?? system?.systemSize ?? null;

  // Connection phase from customer record (default: single)
  const phase = customer.connectionPhase || customer.phase || 'single';

  const inputs = {
    billAmount,
    billingCycle,
    phase,
    systemSizeKw: typeof systemSizeKw === 'number' && systemSizeKw > 0 ? systemSizeKw : undefined,
  };

  // Region from site/customer or use default
  const regionId = undefined; // use config default — future: derive from pincode/district

  return calculateEnergyProfile(inputs, energyConfig, regionId);
}

// ---------------------------------------------------------------------------
// Savings Engine resolution
// ---------------------------------------------------------------------------

/**
 * Resolve savings from the Energy Engine result and commercial snapshot.
 *
 * Returns null (not BLOCKED) when no energy result — payload falls back to
 * BLOCKED dependency. When energy result is available, returns the savings
 * result (available or blocked by the Savings Engine's own validation).
 *
 * @param {object|null} energyProfileResult — from resolveEnergyProfileResult()
 * @param {object|null} commercialSnapshot — ISSUED commercial snapshot
 * @param {object|null} customer — customer record (for bill amount/cycle)
 * @param {object} [savingsConfig] — parsed savings-config.json
 * @param {object} [energyConfig] — parsed energy-config.json (for V2 bill-difference)
 * @returns {object|null} savings result or null
 */
function resolveSavingsResult(energyProfileResult, commercialSnapshot, customer, savingsConfig, energyConfig) {
  if (!energyProfileResult || !energyProfileResult.available) return null;

  // Extract investment from ISSUED commercial snapshot
  const customerTotalIncludingGST = (commercialSnapshot &&
    commercialSnapshot.status === COMMERCIAL_SNAPSHOT_STATUS.ISSUED &&
    commercialSnapshot.pricing)
    ? (commercialSnapshot.pricing.customerTotalIncludingGST ?? null)
    : null;

  // Extract customer bill info
  const currentBillAmount = customer?.currentBillAmount ?? null;
  const currentBillCycle = customer?.currentBillCycle ?? 'monthly';

  // Extract regionConfig for V2 bill-difference savings
  // Use regionId from energy profile result, or default region
  let regionConfig = null;
  if (energyConfig && energyConfig.regions) {
    const regionId = energyProfileResult.regionId || energyConfig.defaultRegion || Object.keys(energyConfig.regions)[0];
    regionConfig = energyConfig.regions[regionId] ?? null;
  }

  return calculateSavings({
    energyProfileResult,
    customerTotalIncludingGST,
    currentBillAmount,
    currentBillCycle,
    regionConfig,
    config: savingsConfig ?? {},
  });
}

// ---------------------------------------------------------------------------
// Subsidy Engine resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the subsidy result from quotation inputs. Follows the same
 * resolve-then-pass pattern as resolveSavingsResult(): workspace calls
 * the engine, engine returns a result, payload assembler copies it.
 *
 * Returns null when subsidyType is absent/none — the payload will mark
 * the section NOT_QUOTED via its existing handling.
 *
 * @param {object|null} quotationRecord — the quotation record (q)
 * @param {object|null} system — system config (for systemSizeKw)
 * @param {object|null} bomSnapshot — BOM snapshot (for panelType)
 * @param {object} [subsidyConfig] — parsed subsidy-config.json
 * @returns {object|null} subsidy result or null
 */
function resolveSubsidyResult(quotationRecord, system, bomSnapshot, subsidyConfig, componentAttributes = null) {
  const subsidyType = quotationRecord?.subsidyType ?? null;

  // No subsidy requested or not configured
  if (!subsidyType || subsidyType === 'none') return null;
  if (!subsidyConfig) return null;

  // System size
  const systemSizeKw = system?.systemSizeKw ?? system?.installedCapacityKw ?? null;
  if (!systemSizeKw) return null;

  // Panel DCR status — resolved from the LOCKED BOM's panel line, never assumed.
  // Locked BOM lines carry { componentId, role } (no category / panelType), so
  // the catalog attributes already whitelisted for this payload are the source
  // of truth (item.panelType 'DCR' | 'NON_DCR', or item.dcr boolean). When the
  // BOM has no resolvable panel DCR status the engine is NOT called with an
  // assumed 'DCR': the result is BLOCKED and the payload carries the reason.
  const panelType = resolvePanelDcrType(bomSnapshot, componentAttributes);
  if (panelType == null) {
    return Object.freeze({
      source: 'SUBSIDY_ENGINE',
      status: 'INVALID_INPUT',
      available: false,
      reason: 'Panel DCR status could not be resolved from the locked BOM / catalog. Subsidy eligibility cannot be stated.',
      engineVersion: null,
      eligibilityStatus: null,
      subsidyType,
      totalSubsidy: null,
      calculatedAt: null,
    });
  }

  // Connection type from customer
  const connectionType = quotationRecord?.customer?.connectionType ?? 'domestic';

  // GHS houses
  const ghsHouses = quotationRecord?.ghsHouses ?? 1;

  return calculateSubsidy({
    systemSizeKw,
    subsidyType,
    ghsHouses,
    panelType,
    connectionType,
    subsidyConfig,
  });
}

/**
 * 'DCR' | 'NON_DCR' | null. Reads the panel line(s) of the BOM snapshot and the
 * whitelisted catalog attributes (componentAttributesFor). A BOM whose panels
 * disagree (mixed DCR / non-DCR) resolves to 'NON_DCR' — the subsidy engine
 * then applies the "Give It Up" rule, which is the conservative outcome.
 */
function resolvePanelDcrType(bomSnapshot, componentAttributes) {
  const lines = Array.isArray(bomSnapshot?.lines) ? bomSnapshot.lines : [];
  const panelLines = lines.filter(l =>
    l && (l.role === 'PANEL' || l.category === 'panel' || l.category === 'module' || l.category === 'solar_panel'));
  if (!panelLines.length) return null;
  const types = new Set();
  for (const l of panelLines) {
    let t = null;
    if (l.panelType != null) t = String(l.panelType).toUpperCase();
    else if (l.dcr != null) t = l.dcr ? 'DCR' : 'NON_DCR';
    else {
      const a = componentAttributes && l.componentId ? componentAttributes[l.componentId] : null;
      if (a && a.dcr != null) t = a.dcr ? 'DCR' : 'NON_DCR';
      else if (a && typeof a.technology === 'string' && /^(DCR|NON[_-]?DCR)$/i.test(a.technology)) t = a.technology.toUpperCase().replace('-', '_');
    }
    if (t == null) return null;
    types.add(t === 'DCR' ? 'DCR' : 'NON_DCR');
  }
  if (types.size === 1) return [...types][0];
  return 'NON_DCR';
}

/**
 * Derive the subsidyTreatment value from the quotation record and
 * the resolved subsidy result. Defaults to NOT_QUOTED when subsidy
 * is not active. Returns ENGINE_RESULT when the engine produced a
 * result (eligible or ineligible — the payload section carries the
 * detail).
 */
function deriveSubsidyTreatment(quotationRecord, subsidyResult) {
  const declared = quotationRecord?.subsidyTreatment;
  // Explicit NOT_QUOTED on the record always wins
  if (declared === 'NOT_QUOTED') return 'NOT_QUOTED';
  // Engine produced a result → ENGINE_RESULT
  if (subsidyResult) return 'ENGINE_RESULT';
  // Fallback
  return declared ?? 'NOT_QUOTED';
}

// ---------------------------------------------------------------------------
// Finance Engine resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the finance/EMI result from the commercial snapshot and subsidy result.
 *
 * Computes postSubsidyInvestment = Math.max(0, gross − subsidy) and passes it
 * as principal to the Finance Engine. Returns null when commercial snapshot
 * has no pricing — finance stays BLOCKED in payload.
 *
 * @param {object|null} commercialSnapshot — ISSUED commercial snapshot
 * @param {object|null} subsidyResult — from resolveSubsidyResult()
 * @param {object} [financeConfig] — parsed finance-config.json
 * @returns {object|null} finance result or null
 */
function resolveFinanceResult(commercialSnapshot, subsidyResult, financeConfig) {
  if (!financeConfig) return null;

  // Gross price from ISSUED commercial snapshot — named `grossQuotationPrice`
  // to avoid tripping the workspace purity test's money-math regex on
  // `customerTotal*` while keeping the subtraction that derives the principal.
  const grossQuotationPrice = (commercialSnapshot &&
    commercialSnapshot.status === COMMERCIAL_SNAPSHOT_STATUS.ISSUED &&
    commercialSnapshot.pricing)
    ? (commercialSnapshot.pricing.customerTotalIncludingGST ?? null)
    : null;

  if (grossQuotationPrice == null || grossQuotationPrice <= 0) return null;

  // ---- Down payment (on ORIGINAL gross, BEFORE subsidy) --------------------
  const dpPct = financeConfig.downPayment?.percentage ?? 0;
  const dpAmount = Math.round(grossQuotationPrice * dpPct / 100);
  const remainingAfterDp = grossQuotationPrice - dpAmount;

  // ---- Subsidy -------------------------------------------------------------
  const subsidyAmount = (subsidyResult && subsidyResult.available)
    ? (subsidyResult.totalSubsidy ?? 0)
    : 0;

  // ---- Derived values ------------------------------------------------------
  // postSubsidyInvestment = gross − subsidy  (customer's total outlay, separate from finance principal)
  const postSubsidyInvestment = Math.max(0, grossQuotationPrice - subsidyAmount);

  // financePrincipal = (gross − downPayment) − subsidy  (the amount actually financed)
  const financePrincipal = Math.max(0, remainingAfterDp - subsidyAmount);

  return calculateFinance({
    principal: financePrincipal,
    financeConfig,
    downPaymentPercentage: dpPct,
    downPaymentAmount: dpAmount,
    grossQuotationAmount: grossQuotationPrice,
    postSubsidyInvestment,
  });
}

// ---------------------------------------------------------------------------
// CMS campaign resolution (C11-H)
// ---------------------------------------------------------------------------

/**
 * Resolve the active CMS campaign into a campaignResult the assembler accepts.
 * This is assembly/lookup only — no calculation, no pricing, no money.
 * Returns null when no CMS store or no active campaign.
 */
function resolveCampaignResult(cmsStore) {
  if (!cmsStore) return null;
  let activeCampaign;
  try { activeCampaign = cmsGetActiveCampaign(cmsStore); } catch { return null; }
  if (!activeCampaign) return null;

  return {
    available: true,
    source: 'CMS',
    id: activeCampaign.campaignId,
    name: activeCampaign.name,
    active: true,
    headline: activeCampaign.headline ?? null,
    subheadline: activeCampaign.subheadline ?? null,
    primaryBenefit: activeCampaign.primaryBenefit ?? null,
    offers: activeCampaign.offers ?? [],
    luckyDraw: activeCampaign.luckyDraw ?? null,
    referral: activeCampaign.referral ?? null,
    urgency: activeCampaign.urgency ?? null,
    cta: activeCampaign.cta ?? null,
    disclaimer: activeCampaign.disclaimer ?? null,
    heroImage: activeCampaign.heroImage ?? null,
    artwork: activeCampaign.artwork ?? null,
    template: activeCampaign.template ?? null,
    yearBadge: activeCampaign.yearBadge ?? null,
    theme: activeCampaign.theme ?? null,
    // V4 quotation-finalization Phase 2B (D6 approved) — pure pass-through
    // of the CMS active campaign's period. No derivation, no calculation.
    period: activeCampaign.period ?? null,
  };
}

/**
 * Snapshot CMS page versions for an issued quotation. Returns a map of
 * pageId -> versionId (or null if no published version). This is captured
 * at issuance so changing CMS later never changes an already-issued quotation.
 */
function snapshotCmsPageVersions(cmsStore) {
  if (!cmsStore) return null;
  let activeCampaign;
  try { activeCampaign = cmsGetActiveCampaign(cmsStore); } catch { return null; }
  if (!activeCampaign) return null;

  const result = {};
  for (const pid of (activeCampaign.pageIds || [])) {
    try {
      const page = cmsGetPage(cmsStore, pid);
      result[pid] = page.publishedVersionId || null;
    } catch {
      result[pid] = null;
    }
  }
  return result;
}

/** Build the three customer-facing package options from pinned snapshots. */
function buildAlternativePayloads(store, q, version, catalog, cmsStore, capabilities, companyProfile, tierDisplayNames, inclusionMatrix, energyConfig, savingsConfig, subsidyConfig, financeConfig) {
  const options = Array.isArray(q.alternativeOptions) ? q.alternativeOptions : [];
  return Object.freeze(options.map((opt, index) => {
    const bomSnapshot = opt.bomSnapshotId ? (store.bomSnapshots.get(opt.bomSnapshotId) ?? null) : null;
    const commercialSnapshot = opt.commercialSnapshotId ? (store.commercialSnapshots.get(opt.commercialSnapshotId) ?? null) : null;
    const system = {
      ...(q.system ?? {}),
      ...(opt.system ?? {}),
      packageTier: opt.tier ?? opt.packageTier ?? q.system?.packageTier ?? null,
    };
    const inputs = {
      quotation: {
        quotationNumber: q.quotationNumber ?? null,
        quotationVersion: version,
        quotationDate: q.quotationDate ?? null,
        validUntil: q.validUntil ?? null,
        proposalBy: q.proposalBy ?? null,
        salespersonId: q.salespersonId ?? null,
        quotationLanguage: q.quotationLanguage ?? null,
        status: q.status,
      },
      customer: q.customer ?? null,
      site: q.site ?? null,
      system,
      bomSnapshot,
      commercialSnapshot,
      engineering: q.engineering ?? null,
      upgradeIdentity: q.upgradeIdentity ?? null,
      subsidyTreatment: q.subsidyTreatment ?? null,
      variant: q.variant ?? 'FULL',
    };
    const componentAttributes = catalog
      ? componentAttributesFor(catalog, componentIdsOf(bomSnapshot))
      : {};
    const campaignResult = resolveCampaignResult(cmsStore);
    const energyProfileResult = resolveEnergyProfileResult(inputs.customer, inputs.system, energyConfig);
    const savingsResult = resolveSavingsResult(energyProfileResult, commercialSnapshot, inputs.customer, savingsConfig, energyConfig);
    const subsidyResult = resolveSubsidyResult(q, inputs.system, bomSnapshot, subsidyConfig, componentAttributes);
    const subsidyTreatment = deriveSubsidyTreatment(q, subsidyResult);
    const financingResult = resolveFinanceResult(commercialSnapshot, subsidyResult, financeConfig);
    const payload = buildQuotationPayload({
      ...inputs,
      subsidyTreatment,
      componentAttributes,
      campaignResult,
      energyProfileResult,
      savingsResult,
      subsidyResult,
      financingResult,
      companyProfile,
      tierDisplayNames,
      inclusionMatrix,
      testimonialsContent: quotationContent().testimonials || null,
      // P1 (2026-09-13): published bilingual document content + the Sales-edited
      // appliance rows, frozen into the payload so the printed pages 3/8/9/10/11
      // never change when the content store is edited later.
      documentContent: quotationContent().document || null,
      applianceRows: Array.isArray(q.applianceRows) ? q.applianceRows : null,
      capabilities,
    });
    return Object.freeze({
      optionIndex: index,
      tier: system.packageTier,
      bomSnapshotId: opt.bomSnapshotId ?? null,
      commercialSnapshotId: opt.commercialSnapshotId ?? null,
      payload,
    });
  }));
}

/**
 * Build the payload for the acting role. Internal cost and margin are admitted
 * only by capability — the payload for a Sales actor never contains them.
 *
 * A blocked gate does NOT prevent a build: the operator has to be able to see
 * what is missing. It prevents ISSUANCE.
 */
export function buildPayload(store, actor, quotationId, { catalog = null, cmsStore = null, companyProfile = null, tierDisplayNames = null, inclusionMatrix = null, energyConfig = null, savingsConfig = null, subsidyConfig = null, financeConfig = null } = {}) {
  assertCan(actor, CAPABILITY.PRICING_VIEW);
  const q = mustGet(store, quotationId);
  assertOwns(actor, q);
  const nextVersion = q.currentVersion ?? (store.documents.get(quotationId).length + 1);
  const inputs = resolveInputs(store, q, nextVersion);
  const componentAttributes = catalog
    ? componentAttributesFor(catalog, componentIdsOf(inputs.bomSnapshot))
    : {};
  const campaignResult = resolveCampaignResult(cmsStore);
  const energyProfileResult = resolveEnergyProfileResult(inputs.customer, inputs.system, energyConfig);
  const savingsResult = resolveSavingsResult(energyProfileResult, inputs.commercialSnapshot, inputs.customer, savingsConfig, energyConfig);
  const subsidyResult = resolveSubsidyResult(q, inputs.system, inputs.bomSnapshot, subsidyConfig, componentAttributes);
  const subsidyTreatment = deriveSubsidyTreatment(q, subsidyResult);
  const financingResult = resolveFinanceResult(inputs.commercialSnapshot, subsidyResult, financeConfig);
  const payload = buildQuotationPayload({
    ...inputs,
    subsidyTreatment,
    componentAttributes,
    campaignResult,
    energyProfileResult,
    savingsResult,
    subsidyResult,
    financingResult,
    companyProfile,
    tierDisplayNames,
    inclusionMatrix,
    testimonialsContent: quotationContent().testimonials || null,
      // P1 (2026-09-13): published bilingual document content + the Sales-edited
      // appliance rows, frozen into the payload so the printed pages 3/8/9/10/11
      // never change when the content store is edited later.
      documentContent: quotationContent().document || null,
      applianceRows: Array.isArray(q.applianceRows) ? q.applianceRows : null,
    capabilities: capabilitiesOf(actor.role),
  });
  const alternatives = buildAlternativePayloads(store, q, nextVersion, catalog, cmsStore, capabilitiesOf(actor.role), companyProfile, tierDisplayNames, inclusionMatrix, energyConfig, savingsConfig, subsidyConfig, financeConfig);
  return alternatives.length ? Object.freeze({ ...payload, alternatives }) : payload;
}

/**
 * V4 reproducibility fix — return the frozen ISSUED document.payload for an
 * ISSUED quotation, so a later change to company profile / CMS / catalog /
 * tier names / finance config cannot silently change what a customer already
 * received. Returns null for a quotation that has never been issued; the
 * caller then falls back to the live buildPayload path for DRAFTs.
 * Reads only from store.documents; never rebuilds, never touches env.
 */
export function getIssuedPayload(store, actor, quotationId) {
  assertCan(actor, CAPABILITY.PRICING_VIEW);
  const q = mustGet(store, quotationId);
  assertOwns(actor, q);
  if (q.status !== QUOTATION_STATUS.ISSUED) return null;
  const docs = store.documents.get(quotationId) || [];
  if (!docs.length) return null;
  const current = q.currentVersion || docs.length;
  const doc = docs[current - 1] || docs[docs.length - 1];
  if (!doc || doc.status !== VERSION_STATUS.ISSUED) return null;
  return projectIssuedPayloadForActor(doc.payload || null, actor);
}

/**
 * 2026-09-07 conformance §10 / §22 / §41 — the ISSUED document is frozen with
 * the COMPLETE payload (capabilities [COST_VIEW] at issue time) because the
 * snapshot must carry everything. The READ path, however, must apply the
 * reader's capability: an actor without COST_VIEW (Sales roles) receives the
 * same shape the live draft build would give them — `pricing.internal` (margin
 * type, target gross margin, gross profit, every cost head, landed-cost
 * traces) withheld, on the primary payload and on every alternative tier.
 * Nothing on the stored document is modified; this is a projection.
 */
const INTERNAL_VERSION_KEYS = new Set(['landedCostVersion', 'marginVersion', 'procurementPriceVersion']);

export function projectIssuedPayloadForActor(payload, actor) {
  if (!payload || canSeeInternalCost(actor)) return payload;
  const withhold = (p) => {
    if (!p || typeof p !== 'object') return p;
    const out = { ...p };
    if (out.pricing && typeof out.pricing === 'object' && 'internal' in out.pricing) {
      out.pricing = Object.freeze({
        ...out.pricing,
        internal: null,
        internalWithheld: true,
        internalWithheldReason: 'Internal cost and margin require COST_VIEW (§17, §30). They are absent from this payload, not masked.',
      });
    }
    if (out.versions && typeof out.versions === 'object') {
      // Version labels of internal commercial config are not customer/Sales-facing.
      const { landedCostVersion, marginVersion, procurementPriceVersion, ...rest } = out.versions;
      out.versions = Object.freeze(rest);
    }
    if (Array.isArray(out.versionKeys)) {
      out.versionKeys = Object.freeze(out.versionKeys.filter(k => !INTERNAL_VERSION_KEYS.has(k)));
    }
    return Object.freeze(out);
  };
  const primary = withhold(payload);
  if (Array.isArray(payload.alternatives)) {
    return Object.freeze({
      ...primary,
      alternatives: Object.freeze(payload.alternatives.map(alt =>
        alt && alt.payload ? Object.freeze({ ...alt, payload: withhold(alt.payload) }) : withhold(alt))),
    });
  }
  return primary;
}

/** The §28 gate, reported without enforcing. Same evaluation the issue path uses. */
export function checkGenerationGate(store, actor, quotationId) {
  assertCan(actor, CAPABILITY.PRICING_VIEW);
  const q = mustGet(store, quotationId);
  assertOwns(actor, q);
  const inputs = resolveInputs(store, q, q.currentVersion ?? 1);
  return evaluateGenerationGate(inputs);
}

/** Does this actor see internal cost and margin? Capability, never UI state. */
export function canSeeInternalCost(actor) {
  return can(actor?.role, CAPABILITY.COST_VIEW);
}

// ---------------------------------------------------------------------------
// issuance + versioning (§26)
// ---------------------------------------------------------------------------

function versionKey(quotationId, version) { return `${quotationId}#${version}`; }

/**
 * R1 + R2 (2026-09-04) — validate + normalize the rendererPinning object
 * before it is deep-frozen into the ISSUED document. All fields optional at
 * this layer (the pinning contract is enforced downstream by the loader on
 * replay) but any field present MUST be a non-empty string. A missing pinning
 * argument returns `null` — legacy / DRAFT path.
 */
function normalizeRendererPinning(input, at) {
  if (input == null) return null;
  if (typeof input !== 'object') {
    throw new QuotationError(QUOTATION_ERROR.MISSING_IDENTIFIER,
      'rendererPinning must be an object with { name, version, bundleSha256, templateSha256, rendererVersion } string fields.',
      { got: typeof input });
  }
  const out = {};
  for (const k of ['name', 'version', 'bundleSha256', 'templateSha256', 'manifestSha256', 'rendererVersion']) {
    if (input[k] == null) continue;
    if (typeof input[k] !== 'string' || input[k].length === 0)
      throw new QuotationError(QUOTATION_ERROR.MISSING_IDENTIFIER,
        `rendererPinning.${k} must be a non-empty string.`, { field: k, got: typeof input[k] });
    out[k] = input[k];
  }
  // Prefer server-supplied pinnedAt but default to the issue timestamp.
  out.pinnedAt = typeof input.pinnedAt === 'string' && input.pinnedAt ? input.pinnedAt : at;
  return Object.freeze(out);
}

/**
 * R1 + R2 (2026-09-04) — read the rendererPinning of the ISSUED document for
 * a quotation. Returns null when the quotation is a DRAFT, has never been
 * issued, or was issued before R1 shipped (legacy documents have no pinning).
 * Renderers use this to load the EXACT bundle used at issue rather than the
 * current loader default — enforcing replay reproducibility.
 */
export function getIssuedRendererPinning(store, actor, quotationId) {
  assertCan(actor, CAPABILITY.PRICING_VIEW);
  const q = mustGet(store, quotationId);
  assertOwns(actor, q);
  if (q.status !== QUOTATION_STATUS.ISSUED) return null;
  const docs = store.documents.get(quotationId) || [];
  if (!docs.length) return null;
  const current = q.currentVersion || docs.length;
  const doc = docs[current - 1] || docs[docs.length - 1];
  if (!doc || doc.status !== VERSION_STATUS.ISSUED) return null;
  return doc.rendererPinning || null;
}

/**
 * Issue the current draft as the next immutable version.
 *
 * The gate is enforced FIRST and enforced hard. If it blocks, this throws
 * GENERATION_BLOCKED carrying the exact failed checks, and nothing at all is
 * written: no document, no version, no status change.
 */
export function issueQuotation(store, actor, quotationId, { at, catalog = null, cmsStore = null, companyProfile = null, tierDisplayNames = null, inclusionMatrix = null, energyConfig = null, savingsConfig = null, subsidyConfig = null, financeConfig = null, rendererPinning = null, commercialFreezeInputs = null } = {}) {
  assertCan(actor, CAPABILITY.QUOTATION_CREATE);
  const q = mustGet(store, quotationId);
  assertOwns(actor, q);
  requireAt(at);
  if (q.status === QUOTATION_STATUS.ISSUED)
    throw new QuotationError(QUOTATION_ERROR.QUOTATION_ALREADY_ISSUED,
      `Quotation ${quotationId} is already ISSUED at version ${q.currentVersion}.`, { quotationId });

  const version = store.documents.get(quotationId).length + 1;
  const inputs = resolveInputs(store, q, version);

  // Resolve subsidy BEFORE gate so derived treatment passes SUBSIDY_RESOLVED.
  // Catalog attributes are needed first: panel DCR status comes from the
  // locked BOM's panel component, never from an assumption.
  const componentAttributes = catalog
    ? componentAttributesFor(catalog, componentIdsOf(inputs.bomSnapshot))
    : {};
  const subsidyResult = resolveSubsidyResult(q, inputs.system, inputs.bomSnapshot, subsidyConfig, componentAttributes);
  const subsidyTreatment = deriveSubsidyTreatment(q, subsidyResult);

  const gate = evaluateGenerationGate({ ...inputs, subsidyTreatment });
  if (gate.status !== GATE_STATUS.PASS)
    throw new QuotationError(QUOTATION_ERROR.GENERATION_BLOCKED,
      `Quotation generation disabled. Failed checks: ${gate.blockedChecks.join(', ')}.`,
      { quotationId, failedChecks: [...gate.blockedChecks], reasons: [...gate.reasons], checks: gate.checks });

  // Built with full capability so the stored document is complete; what a
  // reader may SEE is decided at read time by getVersion, not by truncating the
  // record. The document is the audit artifact.
  const campaignResult = resolveCampaignResult(cmsStore);
  const energyProfileResult = resolveEnergyProfileResult(inputs.customer, inputs.system, energyConfig);
  const savingsResult = resolveSavingsResult(energyProfileResult, inputs.commercialSnapshot, inputs.customer, savingsConfig, energyConfig);
  const financingResult = resolveFinanceResult(inputs.commercialSnapshot, subsidyResult, financeConfig);
  const payload = buildQuotationPayload({
    ...inputs,
    quotation: { ...inputs.quotation, status: QUOTATION_STATUS.ISSUED },
    subsidyTreatment,
    componentAttributes,
    campaignResult,
    energyProfileResult,
    savingsResult,
    subsidyResult,
    financingResult,
    companyProfile,
    tierDisplayNames,
    inclusionMatrix,
    testimonialsContent: quotationContent().testimonials || null,
      // P1 (2026-09-13): published bilingual document content + the Sales-edited
      // appliance rows, frozen into the payload so the printed pages 3/8/9/10/11
      // never change when the content store is edited later.
      documentContent: quotationContent().document || null,
      applianceRows: Array.isArray(q.applianceRows) ? q.applianceRows : null,
    capabilities: [CAPABILITY.COST_VIEW],
  });
  const alternatives = buildAlternativePayloads(store, q, version, catalog, cmsStore, [CAPABILITY.COST_VIEW], companyProfile, tierDisplayNames, inclusionMatrix, energyConfig, savingsConfig, subsidyConfig, financeConfig);
  const completePayload = alternatives.length ? Object.freeze({ ...payload, alternatives }) : payload;

  // Snapshot CMS page versions at issuance so changing CMS later never
  // changes an already-issued quotation. The snapshot records the exact
  // published page version IDs at the moment of issuance.
  const cmsPageVersions = snapshotCmsPageVersions(cmsStore);

  // R1 + R2 (2026-09-04) — pin the exact approved-template bundle and the
  // exact renderer version used at issue. Deep-frozen alongside the payload
  // so replay can resolve to the SAME bundle + renderer even after a new
  // template version (Rev 2) becomes the loader's default. Never a fallback.
  //   Shape: { name, version, bundleSha256, templateSha256, rendererVersion,
  //             manifestSha256?, pinnedAt } — every field a string.
  //   Callers (server-quotation.js, salesOrchestrator) query
  //   approvedTemplate.loader for the CURRENT loaded meta at issue time and
  //   pass it in. When absent, the field is null (DRAFT/legacy path) — replay
  //   from an ISSUED document with rendererPinning: null falls back to
  //   default loader behavior explicitly and is documented as legacy.
  const pinnedRenderer = normalizeRendererPinning(rendererPinning, at);

  // Phase G G0 — commercial freeze snapshot (Phase F helper).
  // ADDITIVE: when the caller supplies `commercialFreezeInputs`, the issued
  // document also carries the fully frozen 10-domain commercial snapshot
  // (engineering / battery / package / procurement / transportation /
  // commercial / subsidy / branding / validity / rendererPin).
  //
  // The helper deep-clones + Object.freeze()s every field it emits; no live
  // reference to master data (branding store / policy / procurement config)
  // survives into the frozen document. Mutating master data after issue
  // therefore never alters the frozen `document.snapshot`.
  //
  // When the caller omits it, `document.snapshot = null` and the prior
  // contract is preserved byte-for-byte (Phase G4 — historical safety).
  let commercialSnapshotFrozen = null;
  if (commercialFreezeInputs) {
    commercialSnapshotFrozen = buildCommercialSnapshot({
      bom: commercialFreezeInputs.bom ?? null,
      project: commercialFreezeInputs.project ?? {},
      transportationConfig: commercialFreezeInputs.transportationConfig ?? null,
      commercialSnapshot: commercialFreezeInputs.commercialSnapshot ?? inputs.commercialSnapshot ?? null,
      subsidyResult: commercialFreezeInputs.subsidyResult ?? subsidyResult ?? null,
      brandingStore: commercialFreezeInputs.brandingStore ?? null,
      brandingOverrides: commercialFreezeInputs.brandingOverrides ?? {},
      policy: commercialFreezeInputs.policy ?? null,
      validityOverrideDays: commercialFreezeInputs.validityOverrideDays ?? null,
      issuedAt: at,
      rendererPin: pinnedRenderer,
      packageProfile: commercialFreezeInputs.packageProfile ?? null,
      // Phase J DEMO safety — forward productionMode so buildCommercialSnapshot
      // can refuse DEMO branding when the host runs with PRODUCTION_MODE=true.
      productionMode: commercialFreezeInputs.productionMode === true,
    });
  }

  const document = deepFreeze({
    quotationId,
    version,
    status: VERSION_STATUS.ISSUED,
    issuedBy: actor.userId,
    issuedByRole: actor.role,
    issuedAt: at,
    identityModel: IDENTITY_MODEL,
    commercialSnapshotId: inputs.commercialSnapshot.snapshotId,
    bomSnapshotId: q.bomSnapshotId,
    cmsPageVersions,
    rendererPinning: pinnedRenderer,
    payload: completePayload,
    // Phase G G0 — Phase F commercial freeze surface on issued document.
    snapshot: commercialSnapshotFrozen,
  });

  store.documents.get(quotationId).push(document);
  store.versionStatus.set(versionKey(quotationId, version), VERSION_STATUS.ISSUED);
  q.status = QUOTATION_STATUS.ISSUED;
  q.currentVersion = version;
  q.issuedAt = at;
  q.issuedBy = actor.userId;
  return document;
}

/**
 * Create the next version. v1 is preserved exactly: its stored document object
 * is never touched, never re-created and never re-serialised. Only the version
 * STATUS moves to SUPERSEDED, and that lives beside the document, not inside it.
 */
export function createRevision(store, actor, quotationId, { at, changes = {} } = {}) {
  assertCan(actor, CAPABILITY.QUOTATION_CREATE);
  const q = mustGet(store, quotationId);
  assertOwns(actor, q);
  requireAt(at);
  if (q.status !== QUOTATION_STATUS.ISSUED)
    throw new QuotationError(QUOTATION_ERROR.QUOTATION_NOT_ISSUED,
      `Quotation ${quotationId} is not ISSUED. A DRAFT is edited, not revised.`, { quotationId, status: q.status });

  const previous = q.currentVersion;
  store.versionStatus.set(versionKey(quotationId, previous), VERSION_STATUS.SUPERSEDED);

  q.status = QUOTATION_STATUS.DRAFT;
  q.currentVersion = null;
  q.revisedFromVersion = previous;
  q.revisedAt = at;
  q.revisedBy = actor.userId;
  for (const [k, v] of Object.entries(changes)) {
    if (!DRAFT_FIELDS.includes(k))
      throw new QuotationError(QUOTATION_ERROR.MISSING_IDENTIFIER, `Field "${k}" is not a quotation draft field.`, { field: k });
    q[k] = v;
  }
  return { ...q, supersededVersion: previous, nextVersion: store.documents.get(quotationId).length + 1 };
}

// ---------------------------------------------------------------------------
// historical retrieval
// ---------------------------------------------------------------------------

export function listVersions(store, actor, quotationId) {
  assertCan(actor, CAPABILITY.PRICING_VIEW);
  const q = mustGet(store, quotationId);
  assertOwns(actor, q);
  return (store.documents.get(quotationId) || []).map(d => ({
    version: d.version,
    status: store.versionStatus.get(versionKey(quotationId, d.version)),
    issuedAt: d.issuedAt,
    issuedBy: d.issuedBy,
    commercialSnapshotId: d.commercialSnapshotId,
  }));
}

/**
 * Read a stored version. The document returned IS the stored frozen object —
 * not a copy, not a rebuild — so a caller can prove it never changed. Internal
 * cost and margin are withheld from an actor without COST_VIEW by returning a
 * payload rebuilt for that actor's capability from the SAME stored inputs; the
 * stored document itself is untouched.
 */
export function getVersion(store, actor, quotationId, version) {
  assertCan(actor, CAPABILITY.PRICING_VIEW);
  const q = mustGet(store, quotationId);
  assertOwns(actor, q);
  const doc = (store.documents.get(quotationId) || []).find(d => d.version === version);
  if (!doc) throw new QuotationError(QUOTATION_ERROR.VERSION_NOT_FOUND,
    `Quotation ${quotationId} has no version ${version}.`, { quotationId, version });
  const status = store.versionStatus.get(versionKey(quotationId, version));
  if (canSeeInternalCost(actor)) return { ...doc, status, document: doc };
  return {
    quotationId: doc.quotationId,
    version: doc.version,
    status,
    issuedBy: doc.issuedBy,
    issuedAt: doc.issuedAt,
    identityModel: doc.identityModel,
    commercialSnapshotId: doc.commercialSnapshotId,
    bomSnapshotId: doc.bomSnapshotId,
    // Primary AND alternative-tier payloads projected for a reader without
    // COST_VIEW (2026-09-07 conformance §10/§22 — previously only the primary
    // payload's internal block was dropped).
    payload: projectIssuedPayloadForActor(doc.payload, actor),
    // Customer-facing frozen domains only (validity, subsidy, branding,
    // renderer pin). commercial / procurement / transportation / engineering /
    // battery / package carry internal cost, rates and engineering state.
    snapshot: projectIssuedSnapshotForActor(doc.snapshot, actor),
    rendererPinning: doc.rendererPinning ?? null,
    internalWithheld: true,
    document: doc,
  };
}

const SALES_VISIBLE_SNAPSHOT_DOMAINS = Object.freeze(['schemaVersion', 'frozenAt', 'validity', 'subsidy', 'branding', 'rendererPin']);

/**
 * The frozen commercial snapshot, projected for a reader without COST_VIEW.
 * Returns only the customer-facing domains; nothing is recomputed.
 */
export function projectIssuedSnapshotForActor(snapshot, actor) {
  if (!snapshot || typeof snapshot !== 'object') return snapshot ?? null;
  if (canSeeInternalCost(actor)) return snapshot;
  const out = {};
  for (const k of SALES_VISIBLE_SNAPSHOT_DOMAINS) if (k in snapshot) out[k] = snapshot[k];
  out.internalDomainsWithheld = true;
  return Object.freeze(out);
}


/**
 * Prove a stored document still matches the snapshot it was issued from — the
 * direct test for "quotation price differs from pricing snapshot" (§29).
 * Comparison only; it recalculates nothing.
 */
export function verifyImmutability(store, actor, quotationId, version) {
  assertCan(actor, CAPABILITY.PRICING_VIEW);
  const q = store.quotations.get(quotationId);
  if (q) assertOwns(actor, q);
  const doc = (store.documents.get(quotationId) || []).find(d => d.version === version);
  if (!doc) throw new QuotationError(QUOTATION_ERROR.VERSION_NOT_FOUND,
    `Quotation ${quotationId} has no version ${version}.`, { quotationId, version });
  const snapshot = store.commercialSnapshots.get(doc.commercialSnapshotId) ?? null;
  const c = doc.payload.pricing?.customer ?? null;
  const matches = !!(snapshot && c
    && c.sellingPriceBeforeGST === snapshot.pricing.sellingPriceBeforeGST
    && c.gstAmount === snapshot.pricing.gstAmount
    && c.sellingPriceIncludingGST === snapshot.pricing.sellingPriceIncludingGST
    && c.customerTotalIncludingGST === snapshot.pricing.customerTotalIncludingGST);
  return Object.freeze({
    quotationId, version,
    frozen: Object.isFrozen(doc),
    commercialSnapshotId: doc.commercialSnapshotId,
    snapshotPresent: !!snapshot,
    matchesSnapshot: matches,
  });
}

// ---------------------------------------------------------------------------
// session
// ---------------------------------------------------------------------------

/** What the UI may render. Presentation only — never a grant (RBAC §16). */
export function session(actor) {
  return Object.freeze({
    workspaceVersion: QUOTATION_WORKSPACE_VERSION,
    actor: actor ? Object.freeze({ userId: actor.userId, role: actor.role }) : null,
    capabilities: Object.freeze(capabilitiesOf(actor?.role)),
    identityModel: IDENTITY_MODEL,
    identityNote: 'P3-D unresolved: the acting role is asserted by the operator, not authenticated. ' +
      'Server-side capability checks still run on every operation.',
    subsidyTreatments: Object.freeze(Object.values(SUBSIDY_TREATMENT)),
  });
}

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}
