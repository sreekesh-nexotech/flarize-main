/**
 * PROCUREMENT BATCH — LANDED COST BUILD-UP.  (Phase 2A, decision P2-J)
 *
 * A procurement delivery charge usually covers several materials at once. The
 * APPROVED allocation is by PURCHASE-VALUE PROPORTION, and only that:
 *
 *   share_i           = purchaseValue_i / totalPurchaseValue
 *   allocatedDelivery = deliveryCost x share_i
 *   landedUnitCost_i  = purchaseUnitPrice_i
 *                     + allocatedDelivery_i / quantity_i
 *                     + explicitly entered other procurement charges / quantity_i
 *
 * NOT by weight. NOT by volume. NOT by quantity. No other formula is invented.
 *
 * SCOPE — supplier -> warehouse ONLY.
 *   Project transportation (warehouse -> customer site) is a separate PROJECT
 *   cost head and is never allocated in here. This module has no reference to
 *   it, and a test asserts that.
 *
 * Every allocation is auditable: batch id, delivery cost, method, each source
 * material, its purchase value, its share and its allocated amount.
 *
 * Determinism: no clock. Rounding is applied once per published figure, and the
 * allocated amounts are reconciled by largest remainder so they sum EXACTLY to
 * the delivery cost — a batch that allocates 4,999 of a 5,000 charge is a bug.
 */

import { roundMoney, sumExact, mulExact, isMoney } from './money.js';

export const ALLOCATION_METHOD = {
  PURCHASE_VALUE_PROPORTION: 'PURCHASE_VALUE_PROPORTION',
};

/** Allocation bases that are explicitly NOT permitted. */
export const FORBIDDEN_ALLOCATION_METHODS = ['WEIGHT', 'VOLUME', 'QUANTITY', 'EQUAL_SPLIT'];

export const BATCH_ERROR = {
  ALLOCATION_METHOD_INVALID: 'ALLOCATION_METHOD_INVALID',
  BATCH_LINE_INVALID: 'BATCH_LINE_INVALID',
  ZERO_PURCHASE_VALUE: 'ZERO_PURCHASE_VALUE',
  PROJECT_TRANSPORT_NOT_ALLOWED: 'PROJECT_TRANSPORT_NOT_ALLOWED',
};

/**
 * Build landed unit costs for one procurement batch.
 *
 * @param {object} batch
 *   procurementBatchId
 *   deliveryCost          the supplier->warehouse charge covering the batch
 *   allocationMethod      must be PURCHASE_VALUE_PROPORTION
 *   lines: [{ componentId, quantity, purchaseUnitPrice,
 *             otherProcurementCharges?: [{ label, amount }] }]
 *   recordedBy, recordedAt, effectiveFrom, versionId   (audit, caller-supplied)
 * @returns {{ ok, batchId, allocation, lines, errors }}
 */
export function buildBatchLandedCosts(batch = {}) {
  const errors = [];
  const method = batch.allocationMethod || ALLOCATION_METHOD.PURCHASE_VALUE_PROPORTION;

  if (FORBIDDEN_ALLOCATION_METHODS.includes(method))
    return fail(BATCH_ERROR.ALLOCATION_METHOD_INVALID,
      `Allocation by ${method} is not permitted. The approved method is PURCHASE_VALUE_PROPORTION.`);
  if (method !== ALLOCATION_METHOD.PURCHASE_VALUE_PROPORTION)
    return fail(BATCH_ERROR.ALLOCATION_METHOD_INVALID,
      `Unknown allocation method "${method}". Only PURCHASE_VALUE_PROPORTION is approved.`);
  if (batch.projectTransportCost != null)
    return fail(BATCH_ERROR.PROJECT_TRANSPORT_NOT_ALLOWED,
      'Project transportation (warehouse -> site) must never be allocated into landed cost. ' +
      'It is a separate project cost head.');

  const raw = [...(batch.lines || [])].sort((a, b) => (a.componentId || '') < (b.componentId || '') ? -1 : 1);
  for (const l of raw)
    if (!l.componentId || !isMoney(l.quantity) || Number(l.quantity) <= 0 || !isMoney(l.purchaseUnitPrice))
      errors.push({ code: BATCH_ERROR.BATCH_LINE_INVALID,
        message: `Batch line "${l.componentId ?? '(no id)'}" needs a componentId, a positive quantity and a purchaseUnitPrice.`,
        detail: l });
  if (errors.length) return { ok: false, batchId: batch.procurementBatchId ?? null, allocation: null, lines: [], errors };

  // ---- purchase value per line, and the batch total -----------------------
  const valued = raw.map(l => ({
    ...l,
    quantity: Number(l.quantity),
    purchaseUnitPrice: Number(l.purchaseUnitPrice),
    purchaseValueExact: mulExact(l.quantity, l.purchaseUnitPrice),
  }));
  const totalPurchaseExact = sumExact(valued.map(l => l.purchaseValueExact));

  const deliveryCost = isMoney(batch.deliveryCost) ? Number(batch.deliveryCost) : 0;
  if (deliveryCost > 0 && !(totalPurchaseExact > 0))
    return fail(BATCH_ERROR.ZERO_PURCHASE_VALUE,
      'A delivery charge cannot be allocated by purchase value when the batch purchase value is zero.');

  // ---- proportional allocation, reconciled to the exact delivery cost -----
  const shares = valued.map(l => totalPurchaseExact > 0 ? l.purchaseValueExact / totalPurchaseExact : 0);
  const exactAlloc = shares.map(s => deliveryCost * s);
  const allocated = reconcileToTotal(exactAlloc, roundMoney(deliveryCost));

  const lines = valued.map((l, i) => {
    const others = (l.otherProcurementCharges || []).filter(c => isMoney(c.amount));
    const othersExact = sumExact(others.map(c => Number(c.amount)));
    const landedTotalExact = l.purchaseValueExact + allocated[i] + othersExact;
    const landedUnitExact = landedTotalExact / l.quantity;
    return Object.freeze({
      componentId: l.componentId,
      quantity: l.quantity,
      purchaseUnitPrice: l.purchaseUnitPrice,
      purchaseValue: roundMoney(l.purchaseValueExact),
      allocationPct: totalPurchaseExact > 0
        ? Math.round((l.purchaseValueExact / totalPurchaseExact) * 1e6) / 1e4 : 0,   // 4 dp
      allocatedDeliveryCost: allocated[i],
      otherProcurementCharges: Object.freeze(others.map(c => Object.freeze({
        label: c.label ?? null, amount: roundMoney(Number(c.amount)) }))),
      otherProcurementChargesTotal: roundMoney(othersExact),
      landedTotalCost: roundMoney(landedTotalExact),
      landedUnitCost: roundMoney(landedUnitExact),
      landedUnitCostExact: landedUnitExact,
      landedCostSource: 'PROCUREMENT_BATCH_ALLOCATION',
      procurementBatchId: batch.procurementBatchId ?? null,
      formula: `${l.purchaseUnitPrice} + (${allocated[i]} + ${roundMoney(othersExact)}) / ${l.quantity}`,
    });
  });

  return {
    ok: true,
    batchId: batch.procurementBatchId ?? null,
    allocation: Object.freeze({
      procurementBatchId: batch.procurementBatchId ?? null,
      deliveryCost: roundMoney(deliveryCost),
      allocationMethod: ALLOCATION_METHOD.PURCHASE_VALUE_PROPORTION,
      scope: 'SUPPLIER_TO_WAREHOUSE',
      totalPurchaseValue: roundMoney(totalPurchaseExact),
      allocatedTotal: sumExact(allocated),
      reconciled: sumExact(allocated) === roundMoney(deliveryCost),
      sourceMaterials: Object.freeze(lines.map(l => Object.freeze({
        componentId: l.componentId, purchaseValue: l.purchaseValue,
        allocationPct: l.allocationPct, allocatedAmount: l.allocatedDeliveryCost }))),
      recordedBy: batch.recordedBy ?? null,
      recordedAt: batch.recordedAt ?? null,
      effectiveFrom: batch.effectiveFrom ?? null,
      versionId: batch.versionId ?? null,
    }),
    lines: Object.freeze(lines),
    errors: Object.freeze([]),
  };

  function fail(code, message) {
    return { ok: false, batchId: batch.procurementBatchId ?? null, allocation: null, lines: [],
      errors: Object.freeze([{ code, message, detail: null }]) };
  }
}

/**
 * Turn a batch result into price-master records the Cost Engine can consume.
 * Purchase price and landed cost stay separate on every record.
 */
export function toPriceMasterEntries(result, { purchasePriceVersion = null, landedCostVersion = null, supplier = null } = {}) {
  if (!result?.ok) return {};
  const out = {};
  for (const l of result.lines) {
    out[l.componentId] = {
      purchasePrice: l.purchaseUnitPrice,
      purchasePriceVersion,
      landedUnitCost: l.landedUnitCost,
      landedCostVersion,
      supplier,
      procurementBatchId: l.procurementBatchId,
      landedCostBuildUp: {
        purchaseUnitPrice: l.purchaseUnitPrice,
        allocatedDeliveryCost: l.allocatedDeliveryCost,
        otherProcurementChargesTotal: l.otherProcurementChargesTotal,
        allocationMethod: ALLOCATION_METHOD.PURCHASE_VALUE_PROPORTION,
        allocationPct: l.allocationPct,
        formula: l.formula,
      },
    };
  }
  return out;
}

/**
 * Distribute rounded amounts so they sum EXACTLY to the target, by largest
 * remainder. Without this a 5,000 charge can allocate to 4,999.
 */
function reconcileToTotal(exactValues, target) {
  const floors = exactValues.map(v => Math.floor(v));
  let remainder = target - floors.reduce((a, b) => a + b, 0);
  const order = exactValues
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  const out = [...floors];
  for (let k = 0; k < order.length && remainder > 0; k++, remainder--) out[order[k].i] += 1;
  return out;
}
