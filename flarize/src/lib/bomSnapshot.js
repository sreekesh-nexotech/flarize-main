/**
 * PROJECT BOM SNAPSHOT + PRICE IMMUTABILITY.  (Phase 1D §13)
 *
 * Once a project BOM is approved/locked it is frozen. A later Procurement
 * price change must NEVER alter it. New quotations use the latest price.
 *
 * BOUNDARY: freezing and comparison. Does not price, does not validate.
 */

export const SNAPSHOT_STATUS = { DRAFT: 'DRAFT', LOCKED: 'LOCKED', SUPERSEDED: 'SUPERSEDED' };

/**
 * Freeze a project BOM. Every line records identity, provenance and the price
 * as at the moment of locking.
 */
export function createProjectBomSnapshot({ projectId, bomLines = [], selections = {}, lockedBy, lockedAt, dataVersion = null, engineeringStatus = null }) {
  const lines = bomLines.map(l => {
    const role = l.role || null;
    const sel = selections[role] || {};
    return Object.freeze({
      componentId: l.componentId || l.itemId || l.catalogItemId || null,
      componentDataVersion: l.componentDataVersion ?? dataVersion,
      role,
      quantity: l.quantity ?? l.qty ?? null,
      unitPurchaseCost: l.unitPurchaseCost ?? l.unitPrice ?? null,
      unitSellingPrice: l.unitSellingPrice ?? null,
      engineeringApprovalState: l.engineeringApprovalState ?? engineeringStatus,
      selectionMethod: sel.selectionMethod || l.selectionMethod || null,
      selectedBy: sel.selectedBy || l.selectedBy || null,
      selectionTimestamp: sel.at || l.selectionTimestamp || null,
    });
  });
  return Object.freeze({
    projectId, status: SNAPSHOT_STATUS.LOCKED,
    lockedBy: lockedBy || null, lockedAt: lockedAt || null,
    dataVersion, engineeringStatus,
    lines: Object.freeze(lines),
  });
}

/** A locked snapshot never changes. Applying a price change returns it unchanged. */
export function applyProcurementPriceChange(snapshot, priceUpdates = {}) {
  if (!snapshot) return snapshot;
  if (snapshot.status === SNAPSHOT_STATUS.LOCKED) return snapshot;
  return {
    ...snapshot,
    lines: snapshot.lines.map(l => priceUpdates[l.componentId] != null
      ? { ...l, unitPurchaseCost: priceUpdates[l.componentId] } : l),
  };
}

/** Price a NEW quotation from current catalog prices — never from a snapshot. */
export function priceForNewQuotation(bomLines, catalogPrices = {}) {
  return bomLines.map(l => {
    const id = l.componentId || l.itemId;
    return { ...l, unitPurchaseCost: catalogPrices[id] ?? l.unitPurchaseCost ?? null };
  });
}

/** What a price change WOULD have done, without doing it. For audit/reporting. */
export function diffSnapshotAgainstCurrentPrices(snapshot, catalogPrices = {}) {
  return (snapshot?.lines || [])
    .filter(l => catalogPrices[l.componentId] != null && catalogPrices[l.componentId] !== l.unitPurchaseCost)
    .map(l => ({ componentId: l.componentId, role: l.role,
      lockedPrice: l.unitPurchaseCost, currentPrice: catalogPrices[l.componentId],
      delta: catalogPrices[l.componentId] - l.unitPurchaseCost }));
}

/** Revision creates a NEW snapshot; the original is marked SUPERSEDED (a copy). */
export function reviseSnapshot(snapshot, changes = {}, { revisedBy, revisedAt } = {}) {
  const superseded = { ...snapshot, status: SNAPSHOT_STATUS.SUPERSEDED };
  return {
    previous: Object.freeze(superseded),
    current: createProjectBomSnapshot({
      projectId: snapshot.projectId,
      bomLines: changes.bomLines || snapshot.lines,
      selections: changes.selections || {},
      lockedBy: revisedBy, lockedAt: revisedAt,
      dataVersion: changes.dataVersion ?? snapshot.dataVersion,
      engineeringStatus: changes.engineeringStatus ?? snapshot.engineeringStatus,
    }),
  };
}
