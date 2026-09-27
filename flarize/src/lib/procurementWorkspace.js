/**
 * PROCUREMENT WORKSPACE — APPLICATION SERVICE LAYER.  (Phase 3, PART F)
 *
 * This is the application layer for the Procurement workflow:
 *
 *   SUPPLIER -> PURCHASE BATCH -> MATERIAL LINES -> PURCHASE PRICE
 *   -> PROCUREMENT DELIVERY / OTHER PROCUREMENT CHARGES
 *   -> PURCHASE-VALUE ALLOCATION -> RECONCILED ALLOCATION -> LANDED UNIT COST
 *   -> VERSIONED PRICE MASTER -> COST ENGINE
 *
 * It contains NO commercial formula, NO allocation rule, NO rate and NO default
 * value. Every computation is delegated to an existing frozen engine:
 *
 *   procurementBatch.js       the ONLY allocation + landed-cost build-up
 *   procurementPriceMaster.js the purchasePrice / landedUnitCost separation
 *   commercialHistory.js      the ONLY history mechanism (append-only, audited)
 *   rbac.js                   capability + ownership enforcement
 *   money.js                  the ONLY rounding rule
 *
 * THE PRICE MASTER IS A PROJECTION, NOT A SECOND STORE.
 *   `priceMasterView` is derived from the commercial history store on every
 *   call. There is no separate mutable table of current prices that could drift
 *   from the audit trail, and no second history mechanism.
 *
 * SCOPE — supplier -> warehouse ONLY.
 *   Project transportation (warehouse -> customer site) is a PROJECT cost head.
 *   It is refused at this boundary by name before the batch engine is reached,
 *   and the engine refuses it again.
 *
 * NOTHING IS INVENTED.
 *   A delivery charge that has not been entered is not zero — the batch cannot
 *   be committed. A component with no committed landed cost is simply absent
 *   from the price master, so the Cost Engine reports its own
 *   LANDED_COST_NOT_CONFIGURED. This layer never substitutes the purchase price
 *   for the landed cost.
 *
 * DETERMINISM: no clock. Every operation takes an `at` from the caller, and
 * version identifiers are derived from batch + component ids, never generated.
 */

import {
  buildBatchLandedCosts, toPriceMasterEntries,
  ALLOCATION_METHOD, FORBIDDEN_ALLOCATION_METHODS, BATCH_ERROR,
} from './procurementBatch.js';
import {
  toPriceRecord, projectUnitCost, procurementUplift, PRICE_KIND, VALID_FOR_PROJECT_COST,
} from './procurementPriceMaster.js';
import {
  createHistoryStore, appendVersion, getHistory, getCurrentVersion, getVersion,
  getVersionEffectiveAt, compareVersions, historyView,
  CONFIG_TYPE, CONFIG_OWNER, CONFIG_STATUS,
} from './commercialHistory.js';
import { assertCan, CAPABILITY, RbacError, RBAC_ERROR, capabilitiesOf } from './rbac.js';
import { isMoney, sumExact, roundMoney } from './money.js';

export const PROCUREMENT_WORKSPACE_VERSION = 'procurement.1';

/** The configuration type this workspace owns. Restated nowhere else. */
export const PROCUREMENT_CONFIG_TYPE = CONFIG_TYPE.PROCUREMENT_PRICE;

export const BATCH_STATUS = {
  DRAFT: 'DRAFT',
  COMMITTED: 'COMMITTED',
};

/**
 * Field names that carry a PROJECT transportation cost. Any of these on a
 * procurement batch is refused: procurement delivery is supplier -> warehouse,
 * project transportation is warehouse -> customer site, and the two never mix.
 */
export const PROJECT_TRANSPORT_FIELDS = Object.freeze([
  'projectTransportCost', 'projectTransportationCost', 'transportationCost',
  'siteDeliveryCost', 'customerSiteDeliveryCost', 'warehouseToSiteCost',
]);

export const PROCUREMENT_ERROR = {
  SUPPLIER_EXISTS: 'SUPPLIER_EXISTS',
  SUPPLIER_NOT_FOUND: 'SUPPLIER_NOT_FOUND',
  BATCH_EXISTS: 'BATCH_EXISTS',
  BATCH_NOT_FOUND: 'BATCH_NOT_FOUND',
  BATCH_ALREADY_COMMITTED: 'BATCH_ALREADY_COMMITTED',
  BATCH_HAS_NO_LINES: 'BATCH_HAS_NO_LINES',
  MISSING_TIMESTAMP: 'MISSING_TIMESTAMP',
  MISSING_BATCH_REFERENCE: 'MISSING_BATCH_REFERENCE',
  DELIVERY_COST_NOT_ENTERED: 'DELIVERY_COST_NOT_ENTERED',
  OTHER_CHARGES_NOT_RECONCILED: 'OTHER_CHARGES_NOT_RECONCILED',
  ALLOCATION_NOT_RECONCILED: 'ALLOCATION_NOT_RECONCILED',
  PROJECT_TRANSPORT_NOT_ALLOWED: BATCH_ERROR.PROJECT_TRANSPORT_NOT_ALLOWED,
  ALLOCATION_METHOD_INVALID: BATCH_ERROR.ALLOCATION_METHOD_INVALID,
  BATCH_INVALID: 'BATCH_INVALID',
  MISSING_CHANGE_REASON: 'MISSING_CHANGE_REASON',
  MISSING_EFFECTIVE_FROM: 'MISSING_EFFECTIVE_FROM',
  COMPONENT_NOT_IN_CATALOG: 'COMPONENT_NOT_IN_CATALOG',
  // Phase D (locked 2.8, 2026-09-05) — seed vs production discipline.
  NO_PRODUCTION_BATCH: 'NO_PRODUCTION_BATCH',
};

export class ProcurementError extends Error {
  constructor(code, message, detail = null) {
    super(message);
    this.name = 'ProcurementError';
    this.code = code;
    this.detail = detail;
  }
}

// ============================================================ store

/** The mutable application store. Engines stay pure; only this holds state. */
export function createProcurementStore(historyStore = null) {
  return {
    procurementWorkspaceVersion: PROCUREMENT_WORKSPACE_VERSION,
    suppliers: {},
    batches: {},
    // The ONE history mechanism. Procurement price versions live here and
    // nowhere else. `priceMasterView` is derived from it.
    historyStore: historyStore || createHistoryStore(),
    audit: [],
  };
}

const need = (at) => {
  if (!at) throw new ProcurementError(PROCUREMENT_ERROR.MISSING_TIMESTAMP,
    'Every procurement operation requires a caller-supplied `at` timestamp. The engines are deterministic and must not read a clock.');
  return at;
};

const supplier = (store, supplierId) => {
  const s = store?.suppliers?.[supplierId];
  if (!s) throw new ProcurementError(PROCUREMENT_ERROR.SUPPLIER_NOT_FOUND,
    `Supplier "${supplierId}" does not exist.`, { supplierId });
  return s;
};

const batch = (store, batchId) => {
  const b = store?.batches?.[batchId];
  if (!b) throw new ProcurementError(PROCUREMENT_ERROR.BATCH_NOT_FOUND,
    `Purchase batch "${batchId}" does not exist.`, { batchId });
  return b;
};

const mutable = (store, batchId) => {
  const b = batch(store, batchId);
  if (b.status === BATCH_STATUS.COMMITTED)
    throw new ProcurementError(PROCUREMENT_ERROR.BATCH_ALREADY_COMMITTED,
      `Purchase batch "${batchId}" is COMMITTED. Committed batches are immutable — record a new batch instead. ` +
      'Price versions are append-only; nothing is edited away.', { batchId });
  return b;
};

const trace = (store, actor, action, detail) => {
  store.audit.push({ action, by: actor.userId, role: actor.role, at: detail?.at ?? null, detail: detail ?? null });
};

// ============================================================ RBAC

/**
 * Procurement WRITE boundary.
 *
 * Two checks, both from rbac.js / commercialHistory.js — neither restated here:
 *   1. the capability PROCUREMENT_PRICE_EDIT
 *   2. ownership of CONFIG_TYPE.PROCUREMENT_PRICE (commercialHistory.CONFIG_OWNER)
 *
 * `rbac.assertOwnsConfig` is deliberately NOT reused: it gates on
 * COMMERCIAL_CONFIG_EDIT, which is the ADMIN commercial-configuration path.
 * Procurement's capability is PROCUREMENT_PRICE_EDIT. The ownership source is
 * the same constant either way.
 */
export function assertProcurementWrite(actor) {
  assertCan(actor, CAPABILITY.PROCUREMENT_PRICE_EDIT);
  const owner = CONFIG_OWNER[PROCUREMENT_CONFIG_TYPE];
  if (owner !== actor.role)
    throw new RbacError(RBAC_ERROR.ROLE_NOT_OWNER,
      `Configuration ${PROCUREMENT_CONFIG_TYPE} is owned by ${owner}. ${actor.role} may not change it.`,
      { configType: PROCUREMENT_CONFIG_TYPE, owner, actorRole: actor.role });
  return true;
}

/** Procurement READ boundary — the commercial history view capability. */
export function assertProcurementRead(actor) {
  return assertCan(actor, CAPABILITY.COMMERCIAL_HISTORY_VIEW);
}

export function session({ actor }) {
  return {
    procurementWorkspaceVersion: PROCUREMENT_WORKSPACE_VERSION,
    configType: PROCUREMENT_CONFIG_TYPE,
    owner: CONFIG_OWNER[PROCUREMENT_CONFIG_TYPE],
    allocationMethod: ALLOCATION_METHOD.PURCHASE_VALUE_PROPORTION,
    forbiddenAllocationMethods: [...FORBIDDEN_ALLOCATION_METHODS],
    validForProjectCost: [...VALID_FOR_PROJECT_COST],
    capabilities: actor?.role ? capabilitiesOf(actor.role) : [],
    canEdit: !!actor?.role && actor.role === CONFIG_OWNER[PROCUREMENT_CONFIG_TYPE],
    scope: 'SUPPLIER_TO_WAREHOUSE',
    scopeNote: 'Procurement delivery is supplier -> warehouse. Project transportation ' +
      '(warehouse -> customer site) is a separate PROJECT cost head and is refused here.',
    identityModel: 'OPERATOR_ASSERTED_ROLE',
    identityNote: 'This installation has a single credential and no per-user store. RBAC is enforced ' +
      'at the service boundary, but the acting role is asserted by the authenticated operator rather ' +
      'than proven by a user identity. Per-user accounts remain a pending decision (P3-D).',
  };
}

// ============================================================ 1 supplier

export function createSupplier(store, { actor, supplierId, name = null, reference = null, at }) {
  assertProcurementWrite(actor);
  need(at);
  if (!supplierId) throw new ProcurementError(PROCUREMENT_ERROR.BATCH_INVALID, 'A supplier needs a supplierId.');
  if (store.suppliers[supplierId])
    throw new ProcurementError(PROCUREMENT_ERROR.SUPPLIER_EXISTS, `Supplier "${supplierId}" already exists.`, { supplierId });
  store.suppliers[supplierId] = {
    supplierId, name, reference,
    createdBy: actor.userId, createdAt: at,
  };
  trace(store, actor, 'SUPPLIER_CREATED', { at, supplierId, name });
  return { ...store.suppliers[supplierId] };
}

export function listSuppliers(store, { actor }) {
  assertProcurementRead(actor);
  return Object.keys(store.suppliers).sort().map(id => ({ ...store.suppliers[id] }));
}

// ============================================================ 2–3 purchase batch

/** Reject any field carrying a PROJECT transportation cost, by name. */
function refuseProjectTransport(payload = {}) {
  const hit = PROJECT_TRANSPORT_FIELDS.filter(f => payload[f] !== undefined && payload[f] !== null);
  if (hit.length)
    throw new ProcurementError(PROCUREMENT_ERROR.PROJECT_TRANSPORT_NOT_ALLOWED,
      'Project transportation (warehouse -> customer site) must never enter a procurement batch. ' +
      'Procurement delivery is supplier -> warehouse only; project transportation is a separate ' +
      `project cost head owned by the Project Head. Refused fields: ${hit.join(', ')}.`,
      { fields: hit });
}

export function createBatch(store, { actor, batchId, supplierId, batchDate = null, batchReference = null, at, ...rest }) {
  assertProcurementWrite(actor);
  need(at);
  refuseProjectTransport(rest);
  if (!batchId) throw new ProcurementError(PROCUREMENT_ERROR.BATCH_INVALID, 'A purchase batch needs a batchId.');
  if (store.batches[batchId])
    throw new ProcurementError(PROCUREMENT_ERROR.BATCH_EXISTS, `Purchase batch "${batchId}" already exists.`, { batchId });
  supplier(store, supplierId);

  store.batches[batchId] = {
    batchId,
    supplierId,
    batchDate,                       // caller-supplied fact, never defaulted to "today"
    batchReference,
    allocationMethod: ALLOCATION_METHOD.PURCHASE_VALUE_PROPORTION,
    deliveryCost: null,              // NOT entered — not zero
    otherChargesDeclared: null,      // optional batch-level control total
    lines: [],
    status: BATCH_STATUS.DRAFT,
    createdBy: actor.userId, createdAt: at,
    committedBy: null, committedAt: null,
    effectiveFrom: null, changeReason: null,
    committedVersionIds: [],
  };
  trace(store, actor, 'BATCH_CREATED', { at, batchId, supplierId, batchReference, batchDate });
  return batchView(store, { actor, batchId });
}

/**
 * Phase D (locked 2.8, 2026-09-05) — Seed-vs-production batch discipline.
 *
 * A batch is SEED when it self-declares `isSeed: true` OR its batchId
 * starts with `BATCH-SEED-` (prefix authoritative per locked 2.8). Legacy
 * batches without the flag are otherwise treated as production. The engine
 * INVENTS NO status — no promotion of seed to production, no silent
 * classification change.
 */
export function isBatchSeed(b) {
  if (!b || typeof b !== 'object') return false;
  if (b.isSeed === true) return true;
  if (typeof b.batchId === 'string' && b.batchId.startsWith('BATCH-SEED-')) return true;
  return false;
}

/** Pure inspection of seed vs production batches in a store. Never mutates. */
export function batchSeedSummary(store) {
  const all = Object.values(store?.batches || {});
  const seed = all.filter(isBatchSeed);
  const prod = all.filter(b => !isBatchSeed(b));
  return {
    total: all.length,
    seed: seed.map(b => b.batchId),
    production: prod.map(b => b.batchId),
    hasProductionBatch: prod.length > 0,
    hasCommittedProductionBatch: prod.some(b => b.status === BATCH_STATUS.COMMITTED),
  };
}

/**
 * Guard for production quotation / project issuance. Throws
 * `NO_PRODUCTION_BATCH` when only seed data is present. Callers invoke
 * this BEFORE marking a quotation ISSUED or a project BOM LOCKED.
 * SEED data remains preserved and testable — never deleted or promoted.
 */
export function assertProductionProcurementAvailable(store) {
  const s = batchSeedSummary(store);
  if (!s.hasCommittedProductionBatch) {
    throw new ProcurementError(PROCUREMENT_ERROR.NO_PRODUCTION_BATCH,
      `Cannot issue: no committed production procurement batch. ${s.total} total batch(es), ${s.seed.length} seed, ${s.production.length} production. Seed batches (${s.seed.join(', ') || 'none'}) are test data; a non-seed COMMITTED batch is required for production quotations (locked 2.8).`,
      { seedCount: s.seed.length, productionCount: s.production.length, hasCommittedProductionBatch: s.hasCommittedProductionBatch });
  }
  return s;
}

export function listBatches(store, { actor }) {
  assertProcurementRead(actor);
  return Object.keys(store.batches).sort().map(id => {
    const b = store.batches[id];
    return {
      batchId: b.batchId, supplierId: b.supplierId,
      // Phase D — expose seed classification for UI / audit visibility.
      isSeed: isBatchSeed(b),
      supplierName: store.suppliers[b.supplierId]?.name ?? null,
      batchDate: b.batchDate, batchReference: b.batchReference,
      status: b.status, lineCount: b.lines.length,
      deliveryCost: b.deliveryCost,
      deliveryCostEntered: isMoney(b.deliveryCost),
      effectiveFrom: b.effectiveFrom,
      committedBy: b.committedBy, committedAt: b.committedAt,
      versionCount: b.committedVersionIds.length,
    };
  });
}

// ============================================================ 4–6 material lines

/**
 * Replace the batch material lines.
 *
 * Quantity and purchase unit price are facts entered by Procurement. Neither is
 * defaulted, inferred from the catalog, or carried over from a previous batch.
 * Line-level other procurement charges are entered explicitly, per the frozen
 * batch engine's contract — they are NOT allocated by any rule.
 */
export function setBatchLines(store, env, { actor, batchId, lines = [], at }) {
  assertProcurementWrite(actor);
  need(at);
  const b = mutable(store, batchId);

  const clean = lines.map((l) => {
    refuseProjectTransport(l);
    if (l.componentId && env && !catalogItem(env, l.componentId))
      throw new ProcurementError(PROCUREMENT_ERROR.COMPONENT_NOT_IN_CATALOG,
        `Component "${l.componentId}" is not in the catalog. A procurement line must reference a real component id.`,
        { componentId: l.componentId });
    const others = (l.otherProcurementCharges || [])
      .filter(c => c && isMoney(c.amount))
      .map(c => ({ label: c.label ?? null, amount: Number(c.amount) }));
    return {
      componentId: l.componentId ?? null,
      quantity: isMoney(l.quantity) ? Number(l.quantity) : null,
      purchaseUnitPrice: isMoney(l.purchaseUnitPrice) ? Number(l.purchaseUnitPrice) : null,
      otherProcurementCharges: others,
    };
  });

  b.lines = clean;
  trace(store, actor, 'BATCH_LINES_SET', { at, batchId, lineCount: clean.length });
  return batchView(store, { actor, batchId });
}

// ============================================================ 7–9 charges + method

/**
 * Delivery cost, optional batch-level other-charges control total, allocation
 * method.
 *
 * `deliveryCost` must be entered explicitly. An absent delivery charge is NOT
 * zero — the batch simply cannot be committed until Procurement records what
 * the supplier actually charged.
 *
 * `otherChargesDeclared` is a CONTROL TOTAL, not an allocatable pool. No
 * approved decision defines an allocation basis for batch-level other
 * procurement charges, so none is invented: the operator enters the per-line
 * amounts and this figure is reconciled against their sum at commit.
 */
export function setBatchCharges(store, { actor, batchId, deliveryCost, otherChargesDeclared, allocationMethod, at, ...rest }) {
  assertProcurementWrite(actor);
  need(at);
  refuseProjectTransport(rest);
  const b = mutable(store, batchId);

  if (allocationMethod !== undefined && allocationMethod !== null) {
    if (FORBIDDEN_ALLOCATION_METHODS.includes(allocationMethod))
      throw new ProcurementError(PROCUREMENT_ERROR.ALLOCATION_METHOD_INVALID,
        `Allocation by ${allocationMethod} is not permitted. The approved method is PURCHASE_VALUE_PROPORTION.`,
        { allocationMethod, forbidden: [...FORBIDDEN_ALLOCATION_METHODS] });
    if (allocationMethod !== ALLOCATION_METHOD.PURCHASE_VALUE_PROPORTION)
      throw new ProcurementError(PROCUREMENT_ERROR.ALLOCATION_METHOD_INVALID,
        `Unknown allocation method "${allocationMethod}". Only PURCHASE_VALUE_PROPORTION is approved.`,
        { allocationMethod });
    b.allocationMethod = allocationMethod;
  }
  if (deliveryCost !== undefined)
    b.deliveryCost = isMoney(deliveryCost) ? Number(deliveryCost) : null;
  if (otherChargesDeclared !== undefined)
    b.otherChargesDeclared = isMoney(otherChargesDeclared) ? Number(otherChargesDeclared) : null;

  trace(store, actor, 'BATCH_CHARGES_SET', { at, batchId,
    deliveryCost: b.deliveryCost, otherChargesDeclared: b.otherChargesDeclared, allocationMethod: b.allocationMethod });
  return batchView(store, { actor, batchId });
}

// ============================================================ 10–14 allocation preview

/** The batch payload handed to the frozen engine. Built, never computed. */
function enginePayload(store, b, { versionIdOf = null } = {}) {
  return {
    procurementBatchId: b.batchId,
    deliveryCost: b.deliveryCost,
    allocationMethod: b.allocationMethod,
    lines: b.lines.map(l => ({
      componentId: l.componentId,
      quantity: l.quantity,
      purchaseUnitPrice: l.purchaseUnitPrice,
      otherProcurementCharges: l.otherProcurementCharges,
    })),
    recordedBy: b.committedBy, recordedAt: b.committedAt,
    effectiveFrom: b.effectiveFrom,
    versionId: versionIdOf ?? null,
  };
}

/** Sum of the explicitly entered line-level other procurement charges. */
function otherChargesEntered(b) {
  return roundMoney(sumExact(b.lines.flatMap(l => (l.otherProcurementCharges || []).map(c => c.amount))));
}

/**
 * Screen C — allocation review.
 *
 * Every number here comes from procurementBatch.buildBatchLandedCosts. This
 * function adds only the reconciliation REPORT, which is an equality check on
 * the engine's own output, not a second calculation.
 */
export function allocationPreview(store, env, { actor, batchId }) {
  assertProcurementRead(actor);
  const b = batch(store, batchId);
  const result = buildBatchLandedCosts(enginePayload(store, b));

  const othersEntered = otherChargesEntered(b);
  const blockers = [];
  if (!b.lines.length) blockers.push({ code: PROCUREMENT_ERROR.BATCH_HAS_NO_LINES,
    message: 'The batch has no material lines.' });
  if (!isMoney(b.deliveryCost)) blockers.push({ code: PROCUREMENT_ERROR.DELIVERY_COST_NOT_ENTERED,
    message: 'The procurement delivery charge has not been entered. It is NOT assumed to be zero — ' +
      'record what the supplier charged for supplier -> warehouse delivery.' });
  if (isMoney(b.otherChargesDeclared) && Number(b.otherChargesDeclared) !== othersEntered)
    blockers.push({ code: PROCUREMENT_ERROR.OTHER_CHARGES_NOT_RECONCILED,
      message: `Batch other procurement charges declared as ${b.otherChargesDeclared} but the entered ` +
        `per-line amounts total ${othersEntered}. There is no approved allocation basis for a batch-level ` +
        'other-charge pool, so it must be entered per line and reconcile exactly.' });
  if (result.ok && !result.allocation.reconciled)
    blockers.push({ code: PROCUREMENT_ERROR.ALLOCATION_NOT_RECONCILED,
      message: 'The allocation does not sum exactly to the entered delivery charge.' });

  return {
    batchId,
    status: b.status,
    supplier: supplierRef(store, b),
    batchDate: b.batchDate, batchReference: b.batchReference,
    allocationMethod: b.allocationMethod,
    forbiddenAllocationMethods: [...FORBIDDEN_ALLOCATION_METHODS],
    scope: 'SUPPLIER_TO_WAREHOUSE',
    deliveryCost: b.deliveryCost,
    deliveryCostEntered: isMoney(b.deliveryCost),
    otherChargesDeclared: b.otherChargesDeclared,
    otherChargesEntered: othersEntered,
    otherChargesReconciled: !isMoney(b.otherChargesDeclared) || Number(b.otherChargesDeclared) === othersEntered,
    ok: result.ok,
    engineErrors: (result.errors || []).map(e => ({ code: e.code, message: e.message, detail: e.detail ?? null })),
    allocation: result.allocation,                       // engine output, verbatim
    reconciled: result.ok ? result.allocation.reconciled : false,
    allocatedTotal: result.ok ? result.allocation.allocatedTotal : null,
    totalPurchaseValue: result.ok ? result.allocation.totalPurchaseValue : null,
    lines: result.ok ? result.lines.map(l => ({
      componentId: l.componentId,
      componentName: env ? (catalogItem(env, l.componentId)?.name ?? null) : null,
      quantity: l.quantity,
      purchaseUnitPrice: l.purchaseUnitPrice,
      purchaseValue: l.purchaseValue,
      allocationPct: l.allocationPct,
      allocatedDeliveryCost: l.allocatedDeliveryCost,
      otherProcurementCharges: l.otherProcurementCharges,
      otherProcurementChargesTotal: l.otherProcurementChargesTotal,
      landedTotalCost: l.landedTotalCost,
      landedUnitCost: l.landedUnitCost,
      landedCostSource: l.landedCostSource,
      formula: l.formula,
      differsFromPurchasePrice: l.landedUnitCost !== l.purchaseUnitPrice,
    })) : [],
    canCommit: result.ok && blockers.length === 0,
    blockers,
  };
}

function supplierRef(store, b) {
  const s = store.suppliers[b.supplierId];
  return s ? { supplierId: s.supplierId, name: s.name, reference: s.reference } : { supplierId: b.supplierId, name: null, reference: null };
}

export function batchView(store, { actor, batchId }) {
  assertProcurementRead(actor);
  const b = batch(store, batchId);
  return {
    batchId: b.batchId,
    supplier: supplierRef(store, b),
    batchDate: b.batchDate, batchReference: b.batchReference,
    allocationMethod: b.allocationMethod,
    deliveryCost: b.deliveryCost, deliveryCostEntered: isMoney(b.deliveryCost),
    otherChargesDeclared: b.otherChargesDeclared,
    otherChargesEntered: otherChargesEntered(b),
    status: b.status,
    lines: b.lines.map(l => ({ ...l, otherProcurementCharges: [...(l.otherProcurementCharges || [])] })),
    createdBy: b.createdBy, createdAt: b.createdAt,
    committedBy: b.committedBy, committedAt: b.committedAt,
    effectiveFrom: b.effectiveFrom, changeReason: b.changeReason,
    committedVersionIds: [...b.committedVersionIds],
    immutable: b.status === BATCH_STATUS.COMMITTED,
  };
}

// ============================================================ 15–19 commit → versions

/**
 * Version identifier. DERIVED, never generated: batch id + component id. No
 * clock, no counter, no randomness — the same batch always produces the same
 * version ids, and commercialHistory refuses a duplicate, which is what makes a
 * double-commit impossible.
 */
export function versionIdFor(batchId, componentId) {
  return `${batchId}::${componentId}`;
}

/**
 * Commit the batch: append ONE PROCUREMENT_PRICE version per material line to
 * the commercial history store.
 *
 * Append-only. The previous ACTIVE version becomes SUPERSEDED and stays
 * readable forever. Nothing is overwritten and nothing is deleted.
 */
export function commitBatch(store, env, { actor, batchId, at, effectiveFrom = null, changeReason = null }) {
  assertProcurementWrite(actor);
  need(at);
  const b = mutable(store, batchId);

  if (!effectiveFrom)
    throw new ProcurementError(PROCUREMENT_ERROR.MISSING_EFFECTIVE_FROM,
      'A price version needs an effective date. It is a recorded fact, not the time of the click.');
  if (!changeReason)
    throw new ProcurementError(PROCUREMENT_ERROR.MISSING_CHANGE_REASON,
      'Every commercial change must record why. commercialHistory refuses an un-audited version.');
  if (!b.batchReference)
    throw new ProcurementError(PROCUREMENT_ERROR.MISSING_BATCH_REFERENCE,
      'A purchase batch needs a supplier reference (invoice / PO number) before it can become a price version.');

  const preview = allocationPreview(store, env, { actor, batchId });
  if (!preview.canCommit)
    throw new ProcurementError(
      preview.blockers[0]?.code ?? PROCUREMENT_ERROR.BATCH_INVALID,
      preview.blockers.map(x => x.message).join(' ') || (preview.engineErrors[0]?.message ?? 'The batch cannot be committed.'),
      { blockers: preview.blockers, engineErrors: preview.engineErrors });

  b.effectiveFrom = effectiveFrom;
  b.changeReason = changeReason;
  b.committedBy = actor.userId;
  b.committedAt = at;

  const result = buildBatchLandedCosts(enginePayload(store, b));
  const sup = supplierRef(store, b);
  const entries = toPriceMasterEntries(result, { supplier: sup.name ?? sup.supplierId });

  let history = store.historyStore;
  const versionIds = [];
  for (const line of result.lines) {
    const entry = entries[line.componentId];
    const versionId = versionIdFor(b.batchId, line.componentId);
    history = appendVersion(history, {
      configType: PROCUREMENT_CONFIG_TYPE,
      recordId: line.componentId,
      versionId,
      changedBy: actor.userId,
      changedAt: at,
      changeReason,
      effectiveFrom,
      value: {
        // The two values stay separate on the record, forever.
        purchasePrice: entry.purchasePrice,
        landedUnitCost: entry.landedUnitCost,
        quantity: line.quantity,
        purchaseValue: line.purchaseValue,
        allocatedDeliveryCost: line.allocatedDeliveryCost,
        otherProcurementChargesTotal: line.otherProcurementChargesTotal,
        allocationMethod: ALLOCATION_METHOD.PURCHASE_VALUE_PROPORTION,
        allocationPct: line.allocationPct,
        allocationScope: 'SUPPLIER_TO_WAREHOUSE',
        landedCostSource: line.landedCostSource,
        formula: line.formula,
        supplierId: sup.supplierId,
        supplier: sup.name,
        supplierReference: sup.reference,
        procurementBatchId: b.batchId,
        batchReference: b.batchReference,
        batchDate: b.batchDate,
        currency: 'INR',
      },
    });
    versionIds.push(versionId);
  }

  store.historyStore = history;
  b.committedVersionIds = versionIds;
  b.status = BATCH_STATUS.COMMITTED;
  trace(store, actor, 'BATCH_COMMITTED', { at, batchId, effectiveFrom, changeReason, versionIds });

  return {
    batchId,
    committed: true,
    versionIds,
    effectiveFrom,
    changedBy: actor.userId,
    changedAt: at,
    changeReason,
    allocation: result.allocation,
    componentsVersioned: versionIds.length,
  };
}

// ============================================================ price master projection

/**
 * The price master the COST ENGINE consumes: { componentId: rawRecord }.
 *
 * Derived from the commercial history store on every call — there is no second
 * table. A component with no committed version is ABSENT, so the Cost Engine
 * reports LANDED_COST_NOT_CONFIGURED rather than being handed a zero.
 *
 * @param {string|null} asOf  optional effective date; without it the ACTIVE
 *                            version is used. Historic dates read historic
 *                            versions — old versions remain readable.
 */
export function priceMasterView(store, { asOf = null } = {}) {
  const out = {};
  for (const key of Object.keys(store.historyStore?.records || {})) {
    if (!key.startsWith(`${PROCUREMENT_CONFIG_TYPE}::`)) continue;
    const componentId = key.slice(PROCUREMENT_CONFIG_TYPE.length + 2);
    const v = asOf
      ? getVersionEffectiveAt(store.historyStore, PROCUREMENT_CONFIG_TYPE, componentId, asOf)
      : getCurrentVersion(store.historyStore, PROCUREMENT_CONFIG_TYPE, componentId);
    if (!v) continue;
    out[componentId] = {
      componentId,
      purchasePrice: v.value.purchasePrice,
      purchasePriceVersion: v.versionId,
      purchasePriceEffectiveFrom: v.effectiveFrom,
      landedUnitCost: v.value.landedUnitCost,
      landedCostVersion: v.versionId,
      landedCostEffectiveFrom: v.effectiveFrom,
      supplier: v.value.supplier ?? null,
      supplierReference: v.value.supplierReference ?? null,
      currency: v.value.currency || 'INR',
      notes: v.value.formula ?? null,
    };
  }
  return out;
}

/** The landed-cost version identifier set currently feeding the Cost Engine. */
export function landedCostVersionSummary(store) {
  const pm = priceMasterView(store);
  const ids = [...new Set(Object.values(pm).map(r => r.landedCostVersion))].sort();
  return { componentCount: Object.keys(pm).length, landedCostVersions: ids };
}

// ============================================================ screen D — material detail

function catalogItem(env, componentId) {
  const cats = env?.catalog?.categories || {};
  for (const key of Object.keys(cats).sort()) {
    const hit = (cats[key].items || []).find(i => i.id === componentId);
    if (hit) return { ...hit, _category: key };
  }
  return null;
}

/**
 * Screen D — material / landed cost detail.
 *
 *   purchase price + allocated delivery + other procurement charges
 *   = landed unit cost
 *
 * Every term, the formula string and the source/version are read from the
 * committed history version. This function computes nothing.
 */
export function materialDetail(store, env, { actor, componentId, asOf = null }) {
  assertProcurementRead(actor);
  const v = asOf
    ? getVersionEffectiveAt(store.historyStore, PROCUREMENT_CONFIG_TYPE, componentId, asOf)
    : getCurrentVersion(store.historyStore, PROCUREMENT_CONFIG_TYPE, componentId);
  const item = catalogItem(env, componentId);
  const record = toPriceRecord(v ? priceMasterView(store, { asOf })[componentId] || {} : { componentId });
  const resolved = projectUnitCost(v ? record : null);

  return {
    componentId,
    componentName: item?.name ?? null,
    category: item?._category ?? null,
    configured: !!v,
    // NOT CONFIGURED, never 0.
    purchasePrice: v ? v.value.purchasePrice : null,
    allocatedDeliveryCost: v ? v.value.allocatedDeliveryCost : null,
    otherProcurementChargesTotal: v ? v.value.otherProcurementChargesTotal : null,
    quantity: v ? v.value.quantity : null,
    landedUnitCost: v ? v.value.landedUnitCost : null,
    buildUp: v ? [
      { term: 'Purchase price', perUnit: v.value.purchasePrice, note: 'What the supplier charges. Never used as project material cost.' },
      { term: 'Allocated procurement delivery', perUnit: perUnit(v.value.allocatedDeliveryCost, v.value.quantity),
        total: v.value.allocatedDeliveryCost, note: 'Supplier -> warehouse, allocated by PURCHASE_VALUE_PROPORTION.' },
      { term: 'Other procurement charges', perUnit: perUnit(v.value.otherProcurementChargesTotal, v.value.quantity),
        total: v.value.otherProcurementChargesTotal, note: 'Entered explicitly per line. Not derived.' },
    ] : [],
    formula: v ? v.value.formula : null,
    formulaShape: 'landedUnitCost = purchaseUnitPrice + (allocatedDeliveryCost + otherProcurementCharges) / quantity',
    formulaSource: 'src/lib/procurementBatch.js — buildBatchLandedCosts',
    allocationMethod: v ? v.value.allocationMethod : null,
    allocationPct: v ? v.value.allocationPct : null,
    allocationScope: v ? v.value.allocationScope : null,
    landedCostSource: v ? v.value.landedCostSource : null,
    version: v ? v.versionId : null,
    versionStatus: v ? v.status : null,
    effectiveFrom: v ? v.effectiveFrom : null,
    changedBy: v ? v.changedBy : null,
    changedAt: v ? v.changedAt : null,
    changeReason: v ? v.changeReason : null,
    previousVersionId: v ? v.previousVersionId : null,
    supplier: v ? v.value.supplier : null,
    supplierReference: v ? v.value.supplierReference : null,
    procurementBatchId: v ? v.value.procurementBatchId : null,
    batchReference: v ? v.value.batchReference : null,
    batchDate: v ? v.value.batchDate : null,
    uplift: v ? procurementUplift(record) : null,
    priceKind: resolved.kind,
    usableAsProjectCost: resolved.ok,
    projectCostReason: resolved.reason,
    validForProjectCost: [...VALID_FOR_PROJECT_COST],
    separationNote: 'purchasePrice and landedUnitCost are separate values. Only landedUnitCost enters project material cost.',
  };
}

function perUnit(total, quantity) {
  if (!isMoney(total) || !isMoney(quantity) || Number(quantity) === 0) return null;
  return roundMoney(Number(total) / Number(quantity));
}

// ============================================================ screen E — history / compare

/** Screen E — full price history for a component. Delegated to commercialHistory. */
export function priceHistoryPanel(store, { actor, componentId }) {
  assertProcurementRead(actor);
  const versions = getHistory(store.historyStore, PROCUREMENT_CONFIG_TYPE, componentId);
  const entries = versions.map((cur, i) => {
    const prev = i > 0 ? versions[i - 1] : null;
    return {
      versionId: cur.versionId,
      status: cur.status,
      effectiveFrom: cur.effectiveFrom,
      effectiveTo: cur.effectiveTo,
      changedBy: cur.changedBy,
      changedAt: cur.changedAt,
      changeReason: cur.changeReason,
      previousVersionId: cur.previousVersionId,
      supersededBy: cur.supersededBy,
      purchasePrice: cur.value.purchasePrice,
      landedUnitCost: cur.value.landedUnitCost,
      procurementBatchId: cur.value.procurementBatchId,
      batchReference: cur.value.batchReference,
      supplier: cur.value.supplier,
      isInitial: !prev,
      diff: prev ? compareVersions(prev, cur) : null,
    };
  });
  return {
    configType: PROCUREMENT_CONFIG_TYPE,
    owner: CONFIG_OWNER[PROCUREMENT_CONFIG_TYPE],
    componentId,
    available: versions.length > 0,
    appendOnly: true,
    current: getCurrentVersion(store.historyStore, PROCUREMENT_CONFIG_TYPE, componentId),
    view: historyView(store.historyStore, PROCUREMENT_CONFIG_TYPE, componentId),
    history: entries.slice().reverse(),          // newest first for display
    versionCount: versions.length,
  };
}

/** Screen E — compare any two versions. Superseded versions stay readable. */
export function compareVersionsPanel(store, { actor, componentId, fromVersionId, toVersionId }) {
  assertProcurementRead(actor);
  const from = fromVersionId
    ? getVersion(store.historyStore, PROCUREMENT_CONFIG_TYPE, componentId, fromVersionId) : null;
  const to = toVersionId
    ? getVersion(store.historyStore, PROCUREMENT_CONFIG_TYPE, componentId, toVersionId)
    : getCurrentVersion(store.historyStore, PROCUREMENT_CONFIG_TYPE, componentId);
  const resolvedFrom = from || (to?.previousVersionId
    ? getVersion(store.historyStore, PROCUREMENT_CONFIG_TYPE, componentId, to.previousVersionId) : null);
  return {
    componentId,
    from: resolvedFrom ? { versionId: resolvedFrom.versionId, status: resolvedFrom.status, value: resolvedFrom.value,
      effectiveFrom: resolvedFrom.effectiveFrom, changedBy: resolvedFrom.changedBy, changedAt: resolvedFrom.changedAt,
      changeReason: resolvedFrom.changeReason } : null,
    to: to ? { versionId: to.versionId, status: to.status, value: to.value, effectiveFrom: to.effectiveFrom,
      changedBy: to.changedBy, changedAt: to.changedAt, changeReason: to.changeReason } : null,
    comparison: compareVersions(resolvedFrom, to),
    readable: { from: !!resolvedFrom, to: !!to },
  };
}

// ============================================================ screen A — dashboard

/** Materials in the catalog that a procurement line may reference. */
export function listMaterials(env, { actor }) {
  assertProcurementRead(actor);
  const cats = env?.catalog?.categories || {};
  const out = [];
  for (const key of Object.keys(cats).sort())
    for (const i of cats[key].items || [])
      out.push({ componentId: i.id, name: i.name ?? null, category: key, status: i.status ?? null });
  return out.sort((a, b) => String(a.componentId) < String(b.componentId) ? -1 : 1);
}

/**
 * Screen A — procurement dashboard.
 *
 * `landedCostConfigured` counts only components with a committed landed-cost
 * version. Everything else is reported as NOT CONFIGURED — the same fact the
 * Cost Engine will report, not a zero.
 */
export function dashboard(store, env, { actor }) {
  assertProcurementRead(actor);
  const pm = priceMasterView(store);
  const configured = Object.keys(pm).sort();
  const batches = listBatches(store, { actor });
  return {
    procurementWorkspaceVersion: PROCUREMENT_WORKSPACE_VERSION,
    supplierCount: Object.keys(store.suppliers).length,
    batchCount: batches.length,
    draftBatches: batches.filter(b => b.status === BATCH_STATUS.DRAFT).length,
    committedBatches: batches.filter(b => b.status === BATCH_STATUS.COMMITTED).length,
    landedCostConfiguredCount: configured.length,
    landedCostVersions: landedCostVersionSummary(store).landedCostVersions,
    batches,
    components: configured.map(id => {
      const rec = toPriceRecord(pm[id]);
      const item = catalogItem(env, id);
      return {
        componentId: id,
        componentName: item?.name ?? null,
        purchasePrice: rec.purchasePrice,
        landedUnitCost: rec.landedUnitCost,
        differs: rec.purchasePrice !== rec.landedUnitCost,
        landedCostVersion: rec.landedCostVersion,
        effectiveFrom: rec.landedCostEffectiveFrom,
        supplier: rec.supplier,
        usableAsProjectCost: projectUnitCost(rec).ok,
      };
    }),
    note: 'Only landedUnitCost enters project material cost. A component absent from this list has no ' +
      'landed cost and the Cost Engine will report LANDED_COST_NOT_CONFIGURED for it — never ₹0.',
  };
}

export {
  ALLOCATION_METHOD, FORBIDDEN_ALLOCATION_METHODS,
  CONFIG_TYPE, CONFIG_OWNER, CONFIG_STATUS, PRICE_KIND,
};
