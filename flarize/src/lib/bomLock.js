/**
 * BOM LOCK POLICY.  (Phase 1E §10, §11)
 *
 * LOCK runs a complete validation pass and then decides:
 *
 *   BLOCKED  -> lock REJECTED. The BOM stays editable. Nothing is changed.
 *   WARNING  -> lock permitted ONLY with explicit acknowledgement of each
 *               warning rule that requires it.
 *   VALID    -> lock granted, immutable snapshot created.
 *
 * BLOCKED never edits the BOM. It is a gate, not a repair. The Project Head
 * fixes the configuration.
 *
 * BOUNDARY: the lock decision and the snapshot. No validation logic of its own —
 * it consumes a checker result.
 */

import { checkProjectBom, SEVERITY, CHECK_STATUS } from './engineeringChecker.js';
import { createProjectBomSnapshot, SNAPSHOT_STATUS } from './bomSnapshot.js';
import { PROJECT_BOM_STATUS } from './projectBom.js';

export const LOCK_RESULT = {
  LOCKED: 'LOCKED',
  REJECTED_BLOCKED: 'REJECTED_BLOCKED',
  REJECTED_UNACKNOWLEDGED: 'REJECTED_UNACKNOWLEDGED',
  ALREADY_LOCKED: 'ALREADY_LOCKED',
};

/**
 * Warning rules that need an explicit, named acknowledgement before lock.
 * A warning that is merely "data not recorded for a non-safety field" does not
 * gate the lock; one that hides an unverified electrical limit does.
 */
export const WARNINGS_REQUIRING_ACKNOWLEDGEMENT = [
  'PBC-D-001',   // inverter DC window not recorded
  'PBC-D-003',   // string length not declared
  'PBC-F-002',   // battery voltage unverifiable
  'PBC-G-002',   // battery current unverifiable
  'PBC-N-001',   // branch/circuit unverifiable
  'PBC-R-002',   // approved upgrade path without an explicit BOM
];

export function requiresAcknowledgement(ruleId) {
  return WARNINGS_REQUIRING_ACKNOWLEDGEMENT.includes(ruleId);
}

/**
 * Attempt to lock a project BOM.
 *
 * @param {object} arg
 *   bom, catalog, batteryMaster, catalogVersion
 *   lockedBy, lockedAt          supplied by the caller (determinism)
 *   acknowledgements            [{ ruleId, by, at, note }]
 *   priceLookup                 { componentId: { purchaseCost, sellingPrice } }
 *   upgrade, futureUpgrade
 * @returns {{ result, locked:boolean, bom, snapshot, validation, missingAcknowledgements, reason }}
 */
export function attemptLock({
  bom, catalog, batteryMaster = {}, catalogVersion = null,
  lockedBy = null, lockedAt = null, acknowledgements = [],
  priceLookup = {}, upgrade = null, futureUpgrade = false,
}) {
  if (!bom) throw new Error('no project BOM');

  if (bom.status === PROJECT_BOM_STATUS.LOCKED)
    return { result: LOCK_RESULT.ALREADY_LOCKED, locked: true, bom, snapshot: bom.lock || null,
             validation: null, missingAcknowledgements: [],
             reason: 'The project BOM is already locked. Create a revision instead.' };

  // A COMPLETE validation pass, every time. Never a cached verdict.
  const validation = checkProjectBom({
    bom, catalog, batteryMaster, at: lockedAt, catalogVersion, upgrade, futureUpgrade,
  });

  if (validation.status === CHECK_STATUS.BLOCKED) {
    const blockers = validation.findings.filter(f => f.severity === SEVERITY.BLOCKED);
    return {
      result: LOCK_RESULT.REJECTED_BLOCKED, locked: false,
      bom,                                  // unchanged — the BOM stays editable
      snapshot: null, validation, missingAcknowledgements: [],
      reason: `Lock rejected: ${blockers.length} safety-critical blocker(s). ` +
              `The BOM has not been modified. Fix the configuration: ` +
              blockers.map(b => `${b.ruleId} ${b.message}`).join(' | '),
    };
  }

  const ackIds = new Set(acknowledgements.map(a => a.ruleId));
  const missing = validation.findings
    .filter(f => f.severity === SEVERITY.WARNING && requiresAcknowledgement(f.ruleId) && !ackIds.has(f.ruleId))
    .map(f => ({ ruleId: f.ruleId, message: f.message }));

  if (missing.length)
    return {
      result: LOCK_RESULT.REJECTED_UNACKNOWLEDGED, locked: false,
      bom, snapshot: null, validation, missingAcknowledgements: missing,
      reason: `Lock rejected: ${missing.length} warning(s) require explicit acknowledgement — ` +
              missing.map(m => m.ruleId).join(', '),
    };

  const snapshot = createProjectBomSnapshot({
    projectId: bom.projectId,
    bomLines: linesFor(bom).map(l => ({
      componentId: l.componentId,
      role: l.role,
      qty: l.quantity,
      unitPurchaseCost: priceLookup[l.componentId]?.purchaseCost ?? null,
      unitSellingPrice: priceLookup[l.componentId]?.sellingPrice ?? null,
      componentDataVersion: catalogVersion,
      engineeringApprovalState: validation.status,
      selectionMethod: l.selectionMethod,
      selectedBy: l.selectedBy,
      selectionTimestamp: l.selectionTimestamp,
    })),
    lockedBy, lockedAt, dataVersion: catalogVersion, engineeringStatus: validation.status,
  });

  const lockRecord = Object.freeze({
    ...snapshot,
    packageId: bom.packageId,
    architecture: bom.architecture,
    rulesVersion: validation.rulesVersion,
    validationStatus: validation.status,
    acknowledgements: Object.freeze(acknowledgements.map(a => Object.freeze({ ...a }))),
  });

  return {
    result: LOCK_RESULT.LOCKED, locked: true,
    bom: Object.freeze({ ...bom, status: PROJECT_BOM_STATUS.LOCKED, lock: lockRecord }),
    snapshot: lockRecord, validation, missingAcknowledgements: [],
    reason: validation.status === CHECK_STATUS.WARNING
      ? 'Locked with acknowledged warnings.'
      : 'Locked. Engineering validation passed.',
  };
}

/** Human-facing summary line for the workspace header. */
export function lockSummary(validation) {
  if (!validation) return { blockers: 0, warnings: 0, canLock: false, label: 'Not validated' };
  const blockers = validation.counts.blocked, warnings = validation.counts.warning;
  return {
    blockers, warnings,
    canLock: blockers === 0,
    label: blockers ? `${blockers} blocker(s), ${warnings} warning(s) — FIX CONFIGURATION`
      : warnings ? `${warnings} warning(s) — acknowledgement may be required`
        : 'All checks passed',
  };
}

function linesFor(bom) {
  const roles = new Set([...bom.packageLines.map(l => l.role), ...Object.keys(bom.overrides)]);
  return [...roles]
    .filter(r => !bom.removedRoles.includes(r))
    .sort()
    .map(r => bom.overrides[r] || bom.packageLines.find(l => l.role === r))
    .filter(Boolean);
}

export { SNAPSHOT_STATUS };
