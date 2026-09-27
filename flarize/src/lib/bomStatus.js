/**
 * BOM ENGINEERING STATUS MODEL.  (Phase 1H)
 *
 * Domain model only. No RBAC, no workflow engine, no persistence.
 *
 * BOUNDARY: "may this configuration proceed?" — not who is allowed to say so.
 */

export const BOM_STATUS = {
  DRAFT: 'DRAFT',
  VALID: 'VALID',
  WARNING: 'WARNING',
  BLOCKED: 'BLOCKED',
  APPROVED: 'APPROVED',
};

const RULES = {
  DRAFT:    { quotation: false, projectLock: false, reason: 'Configuration has not been validated.' },
  BLOCKED:  { quotation: false, projectLock: false, reason: 'Engineering validation failed. Correct the configuration or obtain an authorised override.' },
  WARNING:  { quotation: true,  projectLock: false, requiresApproval: true,
              reason: 'Validation raised warnings. Quotation permitted subject to Project Head approval.' },
  VALID:    { quotation: true,  projectLock: false, reason: 'Engineering validation passed.' },
  APPROVED: { quotation: true,  projectLock: true,  reason: 'Approved by engineering. Project BOM may be locked for execution.' },
};

/** Map a validation result to a BOM status. */
export function statusFromValidation(validation) {
  if (!validation) return BOM_STATUS.DRAFT;
  if (validation.status === 'BLOCKED') return BOM_STATUS.BLOCKED;
  if (validation.status === 'WARNING') return BOM_STATUS.WARNING;
  if (validation.status === 'VALID') return BOM_STATUS.VALID;
  return BOM_STATUS.DRAFT;
}

export function canGenerateQuotation(status) { return !!RULES[status]?.quotation; }
export function canLockProjectBom(status)   { return !!RULES[status]?.projectLock; }
export function requiresApproval(status)    { return !!RULES[status]?.requiresApproval; }
export function statusReason(status)        { return RULES[status]?.reason || 'Unknown status.'; }

/** Legal transitions. APPROVED is reachable only from VALID or WARNING. */
const TRANSITIONS = {
  DRAFT:    ['VALID', 'WARNING', 'BLOCKED'],
  VALID:    ['APPROVED', 'WARNING', 'BLOCKED', 'DRAFT'],
  WARNING:  ['APPROVED', 'VALID', 'BLOCKED', 'DRAFT'],
  BLOCKED:  ['DRAFT', 'VALID', 'WARNING'],
  APPROVED: ['DRAFT'],
};
export function canTransition(from, to) { return (TRANSITIONS[from] || []).includes(to); }

/** The quotation gate. One function, one answer, with a reason. */
export function quotationGate(status) {
  return {
    allowed: canGenerateQuotation(status),
    requiresApproval: requiresApproval(status),
    status,
    reason: statusReason(status),
  };
}
