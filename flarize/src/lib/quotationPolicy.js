/**
 * QUOTATION POLICY — Phase F (locked 2.6, 2026-09-05) + Phase J extension
 * (2026-09-05, PH-controlled effective validity policies).
 *
 * VALIDITY MODEL
 * --------------
 * Business rule (Phase J): Project Head controls quotation validity through
 * an EFFECTIVE POLICY. Policies carry {validityDays, effectiveFrom,
 * effectiveTo, status: ACTIVE|INACTIVE}. Every new quotation resolves the
 * ACTIVE policy whose window contains its issuedAt and freezes that
 * policy's validityDays into the snapshot. Changing a future policy never
 * mutates an already-issued quotation. Sales cannot mutate.
 *
 * v1 back-compat: legacy `validity.defaultDays` remains a fallback when no
 * effective-period policy matches. Per-quotation `overrideDays` (v1) still
 * accepted for the emergency case.
 *
 * POLICY STORE SHAPE
 * ------------------
 *   v1 (still supported):
 *     { schema: 'flarize.quotation-policy/1',
 *       validity: { defaultDays: 15, version, updatedBy, updatedAt } }
 *
 *   v2 (Phase J):
 *     { schema: 'flarize.quotation-policy/2',
 *       validity: { defaultDays: null, ... },              // fallback only
 *       policies: [
 *         { policyId, validityDays, effectiveFrom, effectiveTo,
 *           status: 'ACTIVE'|'INACTIVE', version, createdBy, createdAt }
 *       ] }
 *
 * RBAC: `assertPolicyEditor(actor)` — ADMIN or PROJECT_HEAD.
 *       Sales is refused. Per Phase J the effective-policy owner is
 *       Project Head; Admin retains write access for setup + emergency.
 */
export const POLICY_ERROR = Object.freeze({
  POLICY_NOT_CONFIGURED:   'POLICY_NOT_CONFIGURED',
  VALIDITY_INVALID:        'VALIDITY_INVALID',
  POLICY_EDITOR_FORBIDDEN: 'POLICY_EDITOR_FORBIDDEN',
  POLICY_WINDOW_INVALID:   'POLICY_WINDOW_INVALID',
  POLICY_NOT_ACTIVE:       'POLICY_NOT_ACTIVE',
});

export class PolicyError extends Error {
  constructor(code, message, detail = null) {
    super(message);
    this.name = 'PolicyError';
    this.code = code;
    this.detail = detail;
  }
}

/**
 * Phase J change: Project Head is now a first-class validity-policy editor
 * (business rule: PH controls the effective validity policy). Admin retains
 * access for setup + emergency edits. Sales remains excluded.
 */
export const ALLOWED_POLICY_EDITORS = Object.freeze(['ADMIN', 'PROJECT_HEAD']);

export function assertPolicyEditor(actor) {
  if (!actor || typeof actor !== 'object' || !ALLOWED_POLICY_EDITORS.includes(actor.role))
    throw new PolicyError(POLICY_ERROR.POLICY_EDITOR_FORBIDDEN,
      `Only ${ALLOWED_POLICY_EDITORS.join(' + ')} may edit quotation validity policy.`,
      { role: actor?.role || null });
}

function isPositiveInt(n) {
  return typeof n === 'number' && Number.isFinite(n) && Number.isInteger(n) && n > 0;
}

/** Parse an ISO date/time string to ms since epoch, or throw VALIDITY_INVALID. */
function parseIso(iso, field) {
  const t = new Date(iso).getTime();
  if (isNaN(t)) throw new PolicyError(POLICY_ERROR.VALIDITY_INVALID, `Invalid ${field} "${iso}".`);
  return t;
}

/**
 * Add N days to an ISO date string. Returns ISO string.
 * Simple UTC-day arithmetic — no timezone drift.
 */
function addDays(isoDate, days) {
  const t = parseIso(isoDate, 'issuedAt') + days * 86400000;
  return new Date(t).toISOString();
}

/**
 * Validate a single effective-period policy record. Returns nothing; throws
 * on invalid shape. Called both at write time (Admin surface) and at
 * resolve time (issuance).
 */
export function validatePolicyRecord(p) {
  if (!p || typeof p !== 'object')
    throw new PolicyError(POLICY_ERROR.POLICY_WINDOW_INVALID, 'Policy record is not an object.');
  if (!p.policyId || typeof p.policyId !== 'string')
    throw new PolicyError(POLICY_ERROR.POLICY_WINDOW_INVALID, 'Policy.policyId required.');
  if (!isPositiveInt(p.validityDays))
    throw new PolicyError(POLICY_ERROR.VALIDITY_INVALID,
      `Policy ${p.policyId} validityDays "${p.validityDays}" is not a positive integer.`);
  if (!p.effectiveFrom) throw new PolicyError(POLICY_ERROR.POLICY_WINDOW_INVALID,
    `Policy ${p.policyId} effectiveFrom required.`);
  const from = parseIso(p.effectiveFrom, `policy ${p.policyId} effectiveFrom`);
  const to = p.effectiveTo == null ? null : parseIso(p.effectiveTo, `policy ${p.policyId} effectiveTo`);
  if (to != null && to <= from)
    throw new PolicyError(POLICY_ERROR.POLICY_WINDOW_INVALID,
      `Policy ${p.policyId} effectiveTo (${p.effectiveTo}) must be after effectiveFrom (${p.effectiveFrom}).`);
  if (p.status && p.status !== 'ACTIVE' && p.status !== 'INACTIVE')
    throw new PolicyError(POLICY_ERROR.POLICY_NOT_ACTIVE,
      `Policy ${p.policyId} status "${p.status}" not recognised (ACTIVE|INACTIVE).`);
}

/**
 * Resolve the ACTIVE effective-period policy that contains issuedAtIso.
 * Returns the matching policy record or null when none.
 *
 * A policy matches when:
 *   - status === 'ACTIVE'
 *   - effectiveFrom <= issuedAt
 *   - effectiveTo == null OR effectiveTo > issuedAt
 *
 * When multiple ACTIVE policies overlap, the one with the LATEST
 * effectiveFrom wins (last-published-wins). Deterministic tie-break: policyId
 * lexicographic descending.
 */
export function resolveActivePolicy(policyStore, issuedAtIso) {
  const list = Array.isArray(policyStore?.policies) ? policyStore.policies : [];
  if (list.length === 0) return null;
  const t = parseIso(issuedAtIso, 'issuedAt');
  const matches = [];
  for (const p of list) {
    if (!p || p.status !== 'ACTIVE') continue;
    // Skip malformed policies rather than reject the whole store — record
    // the failure so callers can flag it, but don't block issuance for an
    // orphan bad record.
    try { validatePolicyRecord(p); } catch { continue; }
    const from = parseIso(p.effectiveFrom, 'effectiveFrom');
    const to   = p.effectiveTo == null ? Infinity : parseIso(p.effectiveTo, 'effectiveTo');
    if (from <= t && t < to) matches.push(p);
  }
  if (matches.length === 0) return null;
  matches.sort((a, b) => {
    const af = parseIso(a.effectiveFrom, 'effectiveFrom');
    const bf = parseIso(b.effectiveFrom, 'effectiveFrom');
    if (af !== bf) return bf - af;                    // latest first
    return a.policyId < b.policyId ? 1 : -1;          // lex desc
  });
  return matches[0];
}

/**
 * Resolve the effective validity for a quotation being issued.
 *
 * Resolution order:
 *   1. Per-quotation override (Project-Head emergency escape) — Phase F.
 *   2. ACTIVE effective-period policy whose window contains issuedAt — Phase J.
 *   3. Legacy admin `validity.defaultDays` — v1 fallback.
 *
 * @returns {Object} frozen {validityDays, validUntil, source, policyVersion,
 *                          policyId?, effectiveFrom?, effectiveTo?}
 *   source ∈ 'PROJECT_HEAD_OVERRIDE' | 'EFFECTIVE_POLICY' | 'ADMIN_DEFAULT'
 *
 * Throws POLICY_NOT_CONFIGURED when NONE of the three sources yields a value.
 * Throws VALIDITY_INVALID when an override is supplied but not a positive int.
 */
export function resolveEffectiveValidity(policyStore, overrideDays, issuedAtIso) {
  const hasOverride = isPositiveInt(overrideDays);
  if (overrideDays != null && !hasOverride)
    throw new PolicyError(POLICY_ERROR.VALIDITY_INVALID,
      `Validity override "${overrideDays}" is not a positive integer.`);
  if (hasOverride) {
    return Object.freeze({
      validityDays: overrideDays,
      validUntil: addDays(issuedAtIso, overrideDays),
      source: 'PROJECT_HEAD_OVERRIDE',
      policyVersion: policyStore?.validity?.version ?? null,
    });
  }

  // (2) Effective-period policy.
  const active = resolveActivePolicy(policyStore, issuedAtIso);
  if (active) {
    return Object.freeze({
      validityDays: active.validityDays,
      validUntil: addDays(issuedAtIso, active.validityDays),
      source: 'EFFECTIVE_POLICY',
      policyId: active.policyId,
      policyVersion: active.version ?? null,
      effectiveFrom: active.effectiveFrom,
      effectiveTo: active.effectiveTo ?? null,
    });
  }

  // (3) v1 admin default fallback.
  const def = policyStore?.validity?.defaultDays;
  if (isPositiveInt(def)) {
    return Object.freeze({
      validityDays: def,
      validUntil: addDays(issuedAtIso, def),
      source: 'ADMIN_DEFAULT',
      policyVersion: policyStore?.validity?.version ?? null,
    });
  }

  throw new PolicyError(POLICY_ERROR.POLICY_NOT_CONFIGURED,
    'No ACTIVE effective-period policy contains this issuedAt, no Admin default is set, and no PH override was supplied. Cannot resolve validity.');
}

// ─────────────────────────────────────────────────────────────────────────────
// WRITE SIDE (2026-09-07 conformance §18) — the "Admin surface" this module's
// header always anticipated. Pure functions: take a store, return a NEW store.
// Policies are append-only; to change validity, publish a new policy window and
// set the old one INACTIVE. Historical quotations already froze their
// validityDays and are untouched by any of this.
// ─────────────────────────────────────────────────────────────────────────────

const POLICY_SCHEMA_V2 = 'flarize.quotation-policy/2';

function cloneStore(store) {
  const s = store && typeof store === 'object' ? JSON.parse(JSON.stringify(store)) : {};
  if (!s.schema) s.schema = POLICY_SCHEMA_V2;
  if (!s.validity || typeof s.validity !== 'object')
    s.validity = { defaultDays: null, version: null, updatedBy: null, updatedAt: null, status: 'NOT_CONFIGURED' };
  if (!Array.isArray(s.policies)) s.policies = [];
  return s;
}

/**
 * Publish a new effective-period policy. Refuses duplicates and invalid
 * windows (validatePolicyRecord). Returns the new store.
 */
export function publishPolicy(store, { actor, policy, at }) {
  assertPolicyEditor(actor);
  if (!at) throw new PolicyError(POLICY_ERROR.VALIDITY_INVALID, 'Timestamp (at) is required.');
  const s = cloneStore(store);
  const rec = {
    policyId: policy?.policyId,
    validityDays: policy?.validityDays,
    effectiveFrom: policy?.effectiveFrom,
    effectiveTo: policy?.effectiveTo ?? null,
    status: policy?.status || 'ACTIVE',
    version: policy?.version || `${policy?.policyId}@${at}`,
    createdBy: actor.userId ?? actor.role,
    createdAt: at,
    note: policy?.note ?? null,
  };
  validatePolicyRecord(rec);
  if (s.policies.some(p => p.policyId === rec.policyId))
    throw new PolicyError(POLICY_ERROR.POLICY_WINDOW_INVALID,
      `Policy "${rec.policyId}" already exists. Policies are immutable — publish a new policyId.`, { policyId: rec.policyId });
  s.policies.push(rec);
  return s;
}

/** ACTIVE ⇄ INACTIVE. Never deletes. */
export function setPolicyStatus(store, { actor, policyId, status, at, reason = null }) {
  assertPolicyEditor(actor);
  if (!at) throw new PolicyError(POLICY_ERROR.VALIDITY_INVALID, 'Timestamp (at) is required.');
  if (status !== 'ACTIVE' && status !== 'INACTIVE')
    throw new PolicyError(POLICY_ERROR.POLICY_NOT_ACTIVE, `status must be ACTIVE or INACTIVE (got "${status}").`);
  const s = cloneStore(store);
  const p = s.policies.find(x => x.policyId === policyId);
  if (!p) throw new PolicyError(POLICY_ERROR.POLICY_WINDOW_INVALID, `Policy "${policyId}" not found.`, { policyId });
  p.status = status;
  p.statusChangedBy = actor.userId ?? actor.role;
  p.statusChangedAt = at;
  if (reason) p.statusChangeReason = reason;
  return s;
}

/** v1 fallback default (gap filler between windows). Admin/PH only. */
export function setDefaultValidityDays(store, { actor, defaultDays, at }) {
  assertPolicyEditor(actor);
  if (!at) throw new PolicyError(POLICY_ERROR.VALIDITY_INVALID, 'Timestamp (at) is required.');
  if (defaultDays !== null && !isPositiveInt(defaultDays))
    throw new PolicyError(POLICY_ERROR.VALIDITY_INVALID, `defaultDays "${defaultDays}" is not a positive integer (or null).`);
  const s = cloneStore(store);
  s.validity = {
    ...s.validity,
    defaultDays,
    version: `DEFAULT@${at}`,
    updatedBy: actor.userId ?? actor.role,
    updatedAt: at,
    status: defaultDays == null ? 'NOT_CONFIGURED' : 'CONFIGURED',
  };
  return s;
}

/** Read-side summary for the Admin/PH screen (no mutation). */
export function describePolicyStore(store, nowIso = null) {
  const s = cloneStore(store);
  let active = null;
  try { active = nowIso ? resolveActivePolicy(s, nowIso) : null; } catch { active = null; }
  return {
    schema: s.schema,
    validity: s.validity,
    policies: s.policies.slice().sort((a, b) => String(a.effectiveFrom).localeCompare(String(b.effectiveFrom))),
    activeNow: active ? { policyId: active.policyId, validityDays: active.validityDays } : null,
    configured: s.policies.some(p => p.status === 'ACTIVE') || isPositiveInt(s.validity?.defaultDays),
  };
}
