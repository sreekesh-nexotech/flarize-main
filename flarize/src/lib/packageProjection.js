/**
 * PACKAGE PROJECTION — HYDRATION + VISIBILITY FILTER.  (Phase 3 V4)
 *
 * Two pure, idempotent functions that project the on-disk package registry
 * into the shape the V4 authoring/approval lifecycle expects, and then
 * filter that projection into a runtime-safe view for Sales.
 *
 * Legacy bridge:
 *   The first 48 records on disk were approved before V4 existed and carry
 *   no createdBy/createdAt. `hydrateRegistry` sets `legacyApproved: true`
 *   on those records and projects packageState='APPROVED' so they remain
 *   visible to runtime without a re-approval cycle. Every V4-authored
 *   record carries its own createdBy, so the flag is false there.
 *
 * NEVER synthesise a lastValidation. If it is missing on disk, it stays
 * null — the V4 approval gate will refuse it until Engineering re-runs
 * the checker on a fresh revision.
 */

/** Hydrate a raw registry into V4 record shape. Pure and idempotent. */
export function hydrateRegistry(raw) {
  const schema = raw?.schema ?? null;
  const packages = Array.isArray(raw?.packages) ? raw.packages : [];
  return {
    schema,
    packages: packages.map(hydrateRecord),
  };
}

/** Filter a hydrated registry to the packages Sales runtime may see. */
export function visibleForRuntime(hydratedRegistry) {
  const schema = hydratedRegistry?.schema ?? null;
  const packages = Array.isArray(hydratedRegistry?.packages) ? hydratedRegistry.packages : [];
  return {
    schema,
    packages: packages.filter(pkg =>
      pkg?.packageState === 'APPROVED'
      && !pkg.supersededBy
      && pkg.packageState !== 'ARCHIVED'
    ),
  };
}

/** Compute the projection for a single record without mutating the input. */
function hydrateRecord(record) {
  if (!record || typeof record !== 'object') return record;

  const approvalStatus = record.approvalStatus ?? null;
  const hasCreatedBy = Object.prototype.hasOwnProperty.call(record, 'createdBy') && record.createdBy != null;
  const hasCreatedAt = Object.prototype.hasOwnProperty.call(record, 'createdAt') && record.createdAt != null;
  const legacyApproved = approvalStatus === 'APPROVED' && !hasCreatedBy && !hasCreatedAt;

  const packageState = record.packageState
    ?? (approvalStatus === 'APPROVED' ? 'APPROVED'
      : approvalStatus === 'PROPOSED' ? 'DRAFT'
      : approvalStatus === 'REJECTED' ? 'REJECTED'
      : 'DRAFT');

  const revisionNumber = record.revisionNumber ?? 1;
  // Identity = systemType|size|phase|tier, plus `|FR<systemSize>` for a
  // FUTURE_READY pack (2026-09-08: panels at `size`, system at `systemSize`).
  // Same rule as packageApproval.comboKeyFor — a stored comboKey is never
  // trusted over the identity fields.
  const baseKey = `${record.systemType ?? ''}|${record.size ?? ''}|${record.phase ?? ''}|${record.tier ?? ''}`;
  const comboKey = (record.variant === 'FUTURE_READY' && record.systemSize) ? `${baseKey}|FR${record.systemSize}` : baseKey;
  const supersededBy = record.supersededBy ?? null;
  const architecture = record.architecture ?? null;

  return {
    ...record,
    packageState,
    revisionNumber,
    comboKey,
    supersededBy,
    architecture,
    createdBy: record.createdBy ?? null,
    createdAt: record.createdAt ?? null,
    submittedBy: record.submittedBy ?? null,
    submittedAt: record.submittedAt ?? null,
    archivedBy: record.archivedBy ?? null,
    archivedAt: record.archivedAt ?? null,
    archivalReason: record.archivalReason ?? null,
    lastValidation: record.lastValidation ?? null,
    legacyApproved,
  };
}
