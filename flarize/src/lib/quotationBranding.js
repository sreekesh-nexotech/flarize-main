/**
 * QUOTATION BRANDING — Phase F (locked 2.4 + 2.5) + Phase I multi-account
 * extension (2026-09-05).
 *
 * Versioned Admin/Project-Head-controlled artefacts that appear on the
 * customer-facing quotation:
 *   - Bank details    — MULTI-ACCOUNT (v2). Business can hold >1 active bank.
 *   - UPI details     — MULTI-ACCOUNT (v2). Business can hold >1 active UPI VPA.
 *   - Signature       — SINGLE-SLOT   (v1 shape unchanged). One signatory.
 *   - Seal            — SINGLE-SLOT   (v1 shape unchanged). One company seal.
 *
 * SCHEMA VERSIONS
 * ---------------
 * v1 (`flarize.quotation-branding/1`) — single account per kind:
 *   bank: { current: 'BK-…', versions: { 'BK-…': {versionId, values, ...} } }
 *
 * v2 (`flarize.quotation-branding/2`) — bank + upi become multi-account:
 *   bank: {
 *     primary: 'ACC-…',
 *     accounts: {
 *       'ACC-…': {
 *         accountId, label, status: 'ACTIVE'|'INACTIVE', isDemo: bool,
 *         current: 'BK-…-v2',
 *         versions: { 'BK-…-v1': {versionId, publishedAt, publishedBy, values}, ... }
 *       }
 *     }
 *   }
 *   Signature and seal keep the v1 single-slot shape — real-world constraint:
 *   one authorised signatory + one company seal at a time.
 *
 * A v1 store is READ-side adapted into a synthetic single-account v2 view
 * with accountId 'legacy' + status 'ACTIVE' + isDemo false. The on-disk file
 * is NOT rewritten by this module.
 *
 * FREEZE OUTPUT (locked snapshot fields — renderer contract)
 * ----------------------------------------------------------
 *   snapshot.branding.<kind> = {
 *     accountId,   // NEW in v2 — 'legacy' for adapted v1
 *     versionId,
 *     publishedAt, publishedBy,
 *     source: 'CURRENT_VERSION' | 'PROJECT_HEAD_OVERRIDE',
 *     isDemo: bool,     // NEW in v2 — false for adapted v1
 *     values: { … same scalar shape as v1 — renderer consumes this unchanged … }
 *   }
 *
 * PER-QUOTATION OVERRIDE
 * ----------------------
 * v1 syntax still accepted for back-compat:
 *   overrides.bank = '<versionId>'  → treated as v1 (adapted to accountId 'legacy')
 * v2 syntax (bank/upi):
 *   overrides.bank = { accountId: 'ACC-…', versionId?: 'BK-…' }
 *     - accountId: required, must be an ACTIVE account in the store
 *     - versionId: optional; when omitted the account's `current` version is used
 * v1 syntax remains authoritative for signature + seal (they stay single-slot):
 *   overrides.signature = '<versionId>'
 *
 * RBAC: `assertBrandingEditor(actor)` — Admin + Project Head only. Sales is
 * rejected. Unchanged from Phase F.
 */
export const BRANDING_KINDS = Object.freeze(['bank', 'upi', 'signature', 'seal']);

/** Which kinds carry the multi-account shape in v2. Signature + seal stay single-slot. */
const MULTI_ACCOUNT_KINDS = new Set(['bank', 'upi']);

export const BRANDING_SCHEMA_V1 = 'flarize.quotation-branding/1';
export const BRANDING_SCHEMA_V2 = 'flarize.quotation-branding/2';

export const BRANDING_ERROR = Object.freeze({
  BRANDING_NOT_CONFIGURED:      'BRANDING_NOT_CONFIGURED',
  BRANDING_VERSION_NOT_FOUND:   'BRANDING_VERSION_NOT_FOUND',
  BRANDING_KIND_INVALID:        'BRANDING_KIND_INVALID',
  BRANDING_EDITOR_FORBIDDEN:    'BRANDING_EDITOR_FORBIDDEN',
  BRANDING_ACCOUNT_NOT_FOUND:   'BRANDING_ACCOUNT_NOT_FOUND',
  BRANDING_ACCOUNT_INACTIVE:    'BRANDING_ACCOUNT_INACTIVE',
  BRANDING_OVERRIDE_INVALID:    'BRANDING_OVERRIDE_INVALID',
});

export class BrandingError extends Error {
  constructor(code, message, detail = null) {
    super(message);
    this.name = 'BrandingError';
    this.code = code;
    this.detail = detail;
  }
}

/** Roles allowed to publish new branding versions (locked 2.4 + 2.5). Sales excluded. */
export const ALLOWED_BRANDING_EDITORS = Object.freeze(['ADMIN', 'PROJECT_HEAD']);

export function assertBrandingEditor(actor) {
  if (!actor || typeof actor !== 'object')
    throw new BrandingError(BRANDING_ERROR.BRANDING_EDITOR_FORBIDDEN, 'No actor supplied for branding write.');
  if (!ALLOWED_BRANDING_EDITORS.includes(actor.role))
    throw new BrandingError(BRANDING_ERROR.BRANDING_EDITOR_FORBIDDEN,
      `Role "${actor.role}" cannot edit quotation branding. Only ${ALLOWED_BRANDING_EDITORS.join(' + ')} may publish new branding versions.`,
      { role: actor.role });
}

// ─────────────────────────────────────────────────────────────────────────────
// Read-side adapter — normalises any store (v1 or v2) into an internal v2
// view. Never mutates the input.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * True when the kind block on the store is in v1 shape ({current, versions}).
 * v2 shape ({primary, accounts}) has neither `current` nor `versions` at the
 * kind level — those live inside each account.
 */
function isV1KindShape(kindBlock) {
  if (!kindBlock || typeof kindBlock !== 'object') return true; // treat missing as v1-empty
  const hasV2 = ('primary' in kindBlock) || ('accounts' in kindBlock && typeof kindBlock.accounts === 'object');
  if (hasV2) return false;
  return ('current' in kindBlock) || ('versions' in kindBlock);
}

/** Wrap a v1 kind block ({current, versions}) as a single-account v2 view. */
function adaptV1KindToV2(kindBlock) {
  const current  = kindBlock?.current  ?? null;
  const versions = kindBlock?.versions ?? {};
  if (!current && Object.keys(versions).length === 0) {
    return { primary: null, accounts: {} };
  }
  return {
    primary: 'legacy',
    accounts: {
      legacy: {
        accountId: 'legacy',
        label: 'legacy',
        status: 'ACTIVE',
        isDemo: false,
        current,
        versions,
      },
    },
  };
}

/**
 * Return an internal v2 view for a kind. Signature + seal are kept single-slot
 * and returned as a synthesised single-account v2 shape as well — that keeps the
 * selection logic uniform without changing their on-disk schema.
 */
function readKindAsV2(store, kind) {
  if (!BRANDING_KINDS.includes(kind))
    throw new BrandingError(BRANDING_ERROR.BRANDING_KIND_INVALID, `Unknown branding kind "${kind}".`);
  const block = store?.[kind];
  if (isV1KindShape(block)) return adaptV1KindToV2(block);
  // Already v2 shape — return as-is (a shallow-shape validation without cloning).
  return {
    primary: block.primary ?? null,
    accounts: block.accounts ?? {},
  };
}

/**
 * Legacy convenience — the "current" versionId for a kind. In v2 this means
 * the primary account's current version. Returns null when nothing is
 * published. Kept for callers written against the Phase F API.
 */
export function currentVersionId(store, kind) {
  const view = readKindAsV2(store, kind);
  if (!view.primary) return null;
  const acc = view.accounts?.[view.primary];
  return acc?.current ?? null;
}

/**
 * Legacy convenience — fetch a version record by id, searching every account
 * of the kind. Kept for callers written against the Phase F API (Phase F
 * tests still use this shape).
 */
export function getVersion(store, kind, versionId) {
  const view = readKindAsV2(store, kind);
  for (const acc of Object.values(view.accounts || {})) {
    const rec = acc?.versions?.[versionId];
    if (rec) return rec;
  }
  throw new BrandingError(BRANDING_ERROR.BRANDING_VERSION_NOT_FOUND,
    `Branding ${kind} version "${versionId}" not found.`, { kind, versionId });
}

// ─────────────────────────────────────────────────────────────────────────────
// Freeze — the surface commercialFreeze / issueQuotation invoke.
// ─────────────────────────────────────────────────────────────────────────────

function deepFreezeClone(v) {
  const cloned = v == null ? v : JSON.parse(JSON.stringify(v));
  if (cloned == null) return cloned;
  const freeze = (x) => {
    if (x == null || typeof x !== 'object') return x;
    for (const k of Object.keys(x)) freeze(x[k]);
    return Object.freeze(x);
  };
  return freeze(cloned);
}

/**
 * Resolve the {account, version} that should be frozen for one kind.
 * Returns null when no version is published anywhere for that kind and no
 * override was supplied. Otherwise returns the resolved account + version
 * plus their `source` and `isDemo` context.
 *
 * @param {Object} v2view  {primary, accounts}
 * @param {string} kind    'bank' | 'upi' | 'signature' | 'seal'
 * @param {string|Object|null|undefined} override
 *   v1 shape: string versionId (searched across accounts).
 *   v2 shape: { accountId, versionId? }
 *   null/undefined: use the primary account's current version.
 * @returns {null | { account, versionRec, versionId, source, isDemo }}
 */
function resolveKindSelection(v2view, kind, override) {
  // v2 object override — required for cross-account selection.
  if (override && typeof override === 'object') {
    const { accountId, versionId } = override;
    if (!accountId || typeof accountId !== 'string')
      throw new BrandingError(BRANDING_ERROR.BRANDING_OVERRIDE_INVALID,
        `Branding ${kind} override object must carry a non-empty accountId.`,
        { kind, override });
    const account = v2view.accounts?.[accountId];
    if (!account)
      throw new BrandingError(BRANDING_ERROR.BRANDING_ACCOUNT_NOT_FOUND,
        `Branding ${kind} account "${accountId}" not found.`, { kind, accountId });
    if (account.status && account.status !== 'ACTIVE')
      throw new BrandingError(BRANDING_ERROR.BRANDING_ACCOUNT_INACTIVE,
        `Branding ${kind} account "${accountId}" is ${account.status}; cannot select for a new quotation.`,
        { kind, accountId, status: account.status });
    const targetVersionId = versionId || account.current;
    if (!targetVersionId) return null;
    const rec = account.versions?.[targetVersionId];
    if (!rec)
      throw new BrandingError(BRANDING_ERROR.BRANDING_VERSION_NOT_FOUND,
        `Branding ${kind} account "${accountId}" version "${targetVersionId}" not found.`,
        { kind, accountId, versionId: targetVersionId });
    return {
      account, versionRec: rec, versionId: targetVersionId,
      source: 'PROJECT_HEAD_OVERRIDE',
      isDemo: !!(account.isDemo || rec.isDemo),
    };
  }

  // v1 string override — accept for back-compat. Searches every account.
  if (typeof override === 'string' && override.length > 0) {
    for (const account of Object.values(v2view.accounts || {})) {
      const rec = account?.versions?.[override];
      if (rec) {
        if (account.status && account.status !== 'ACTIVE')
          throw new BrandingError(BRANDING_ERROR.BRANDING_ACCOUNT_INACTIVE,
            `Branding ${kind} account "${account.accountId}" is ${account.status}; cannot select for a new quotation.`,
            { kind, accountId: account.accountId, status: account.status });
        return {
          account, versionRec: rec, versionId: override,
          source: 'PROJECT_HEAD_OVERRIDE',
          isDemo: !!(account.isDemo || rec.isDemo),
        };
      }
    }
    throw new BrandingError(BRANDING_ERROR.BRANDING_VERSION_NOT_FOUND,
      `Branding ${kind} version "${override}" not found in any account.`,
      { kind, versionId: override });
  }

  // No override — use the primary account + its current version.
  if (!v2view.primary) return null;
  const account = v2view.accounts?.[v2view.primary];
  if (!account) return null; // primary points at nothing — treat as unconfigured
  if (account.status && account.status !== 'ACTIVE')
    throw new BrandingError(BRANDING_ERROR.BRANDING_ACCOUNT_INACTIVE,
      `Primary branding ${kind} account "${account.accountId}" is ${account.status}. Select an ACTIVE account explicitly.`,
      { kind, accountId: account.accountId, status: account.status });
  const targetVersionId = account.current;
  if (!targetVersionId) return null;
  const rec = account.versions?.[targetVersionId];
  if (!rec)
    throw new BrandingError(BRANDING_ERROR.BRANDING_VERSION_NOT_FOUND,
      `Branding ${kind} account "${account.accountId}" current version "${targetVersionId}" not found.`,
      { kind, accountId: account.accountId, versionId: targetVersionId });
  return {
    account, versionRec: rec, versionId: targetVersionId,
    source: 'CURRENT_VERSION',
    isDemo: !!(account.isDemo || rec.isDemo),
  };
}

/**
 * Compose the branding snapshot to freeze into an issued quotation.
 *
 * @param {Object} store               loaded quotation-branding-state.json (v1 or v2 shape)
 * @param {Object} [overrides]         per-quotation overrides.
 *   - v1: { bank: '<versionId>', upi: '<versionId>', signature: '<versionId>', seal: '<versionId>' }
 *   - v2: { bank: { accountId, versionId? }, upi: { accountId, versionId? }, signature: '<versionId>', seal: '<versionId>' }
 *   Signature + seal stay single-slot and accept only string versionId.
 * @returns {Object} frozen snapshot { kind: {accountId, versionId, values, isDemo, ...} | null }
 *
 * When a kind is not configured (no primary account, no override, or the primary
 * has no current version), snapshot[kind] = null. The renderer must handle
 * null explicitly (suppress the branding block). Nothing is invented.
 */
export function freezeBrandingSnapshot(store, overrides = {}) {
  const out = {};
  for (const kind of BRANDING_KINDS) {
    const view = readKindAsV2(store, kind);
    // Signature + seal do not accept v2 object overrides — force v1 string form.
    const rawOverride = overrides?.[kind];
    if (!MULTI_ACCOUNT_KINDS.has(kind) && rawOverride && typeof rawOverride === 'object')
      throw new BrandingError(BRANDING_ERROR.BRANDING_OVERRIDE_INVALID,
        `Branding ${kind} is single-slot; override must be a versionId string, not an account object.`,
        { kind, override: rawOverride });

    let resolved = null;
    try { resolved = resolveKindSelection(view, kind, rawOverride); }
    catch (e) {
      // Any explicit refusal (invalid account / inactive / missing version) is
      // FATAL — never silently fall back to primary. Preserve error code.
      throw e;
    }

    if (!resolved) { out[kind] = null; continue; }
    out[kind] = deepFreezeClone({
      accountId: resolved.account?.accountId ?? null,
      versionId: resolved.versionId,
      publishedAt: resolved.versionRec.publishedAt ?? null,
      publishedBy: resolved.versionRec.publishedBy ?? null,
      source: resolved.source,
      isDemo: !!resolved.isDemo,
      values: resolved.versionRec.values ?? null,
    });
  }
  return Object.freeze(out);
}

// ─────────────────────────────────────────────────────────────────────────────
// Store introspection helpers (read-only) — useful to admin UI and tests.
// ─────────────────────────────────────────────────────────────────────────────

/** List account summaries for a kind, adapting v1 stores as needed. */
export function listAccounts(store, kind) {
  if (!BRANDING_KINDS.includes(kind))
    throw new BrandingError(BRANDING_ERROR.BRANDING_KIND_INVALID, `Unknown branding kind "${kind}".`);
  const view = readKindAsV2(store, kind);
  return Object.values(view.accounts || {}).map(acc => ({
    accountId: acc.accountId ?? null,
    label: acc.label ?? null,
    status: acc.status ?? 'ACTIVE',
    isDemo: !!acc.isDemo,
    current: acc.current ?? null,
    versionCount: Object.keys(acc.versions || {}).length,
    isPrimary: acc.accountId === view.primary,
  }));
}

/** Return whether any account under this kind carries isDemo:true. */
export function kindContainsDemo(store, kind) {
  const view = readKindAsV2(store, kind);
  return Object.values(view.accounts || {}).some(acc => !!acc.isDemo
    || Object.values(acc.versions || {}).some(v => !!v.isDemo));
}

// ─────────────────────────────────────────────────────────────────────────────
// WRITE SIDE (2026-09-07 conformance §19) — Admin + Project Head publish
// branding. Pure: take a store, return a NEW store. Versions are IMMUTABLE once
// published (publish a new versionId to change a live value). Accounts are
// never deleted — only ACTIVE/INACTIVE. Already-issued quotations hold their
// own frozen copy and are untouched.
// ─────────────────────────────────────────────────────────────────────────────

// (MULTI_ACCOUNT_KINDS is the Set declared above in the read-side section.)

function cloneBrandingStore(store) {
  const s = store && typeof store === 'object' ? JSON.parse(JSON.stringify(store)) : {};
  if (!s.schema) s.schema = BRANDING_SCHEMA_V2;
  for (const kind of MULTI_ACCOUNT_KINDS) {
    if (!s[kind] || typeof s[kind] !== 'object') s[kind] = { primary: null, accounts: {} };
    // upgrade a v1 single-slot block into a 'legacy' account so writes are uniform
    if (isV1KindShape(s[kind])) {
      const v1 = s[kind];
      const hasAny = v1.current || Object.keys(v1.versions || {}).length;
      s[kind] = hasAny
        ? { primary: 'legacy', accounts: { legacy: { accountId: 'legacy', label: 'legacy', status: 'ACTIVE', isDemo: false, current: v1.current ?? null, versions: v1.versions ?? {} } } }
        : { primary: null, accounts: {} };
    }
    if (!s[kind].accounts) s[kind].accounts = {};
  }
  for (const kind of ['signature', 'seal']) {
    if (!s[kind] || typeof s[kind] !== 'object') s[kind] = { current: null, versions: {} };
    if (!s[kind].versions) s[kind].versions = {};
  }
  return s;
}

const REQUIRED_VALUES = Object.freeze({
  bank: ['bankName', 'accountName', 'accountNumber', 'ifsc'],
  upi: ['upiId'],
  signature: ['signatoryName'],
  seal: [],
});

function assertValues(kind, values) {
  if (!values || typeof values !== 'object')
    throw new BrandingError(BRANDING_ERROR.BRANDING_VERSION_NOT_FOUND, `values object is required for ${kind}.`);
  const missing = REQUIRED_VALUES[kind].filter(f => values[f] == null || values[f] === '');
  if (missing.length)
    throw new BrandingError(BRANDING_ERROR.BRANDING_VERSION_NOT_FOUND,
      `Branding ${kind} values missing: ${missing.join(', ')}.`, { kind, missing });
}

/**
 * Publish a new version. For bank/upi an accountId is required (created on
 * first use with label/status/isDemo). For signature/seal the single slot is
 * used. Sets the account's `current` to the new version; sets `primary` when
 * the kind had none.
 */
export function publishBrandingVersion(store, { actor, kind, accountId = null, label = null, isDemo = false, values, versionId = null, at, makePrimary = false }) {
  assertBrandingEditor(actor);
  if (!BRANDING_KINDS.includes(kind))
    throw new BrandingError(BRANDING_ERROR.BRANDING_KIND_INVALID, `Unknown branding kind "${kind}".`);
  if (!at) throw new BrandingError(BRANDING_ERROR.BRANDING_VERSION_NOT_FOUND, 'Timestamp (at) is required.');
  assertValues(kind, values);
  const s = cloneBrandingStore(store);
  const prefix = { bank: 'BK', upi: 'UPI', signature: 'SIG', seal: 'SEAL' }[kind];
  const rec = {
    // Default id carries the full timestamp (ms) so two publishes within one
    // second do not collide; a collision is still refused (versions are immutable).
    versionId: versionId || `${prefix}-${(accountId || 'slot').replace(/[^A-Za-z0-9_-]/g, '')}-${at.replace(/[^0-9]/g, '').slice(0, 17)}`,
    publishedAt: at,
    publishedBy: actor.userId ?? actor.role,
    isDemo: !!isDemo,
    values: JSON.parse(JSON.stringify(values)),
  };
  if (MULTI_ACCOUNT_KINDS.has(kind)) {
    if (!accountId) throw new BrandingError(BRANDING_ERROR.BRANDING_ACCOUNT_NOT_FOUND, `accountId is required for ${kind}.`);
    const block = s[kind];
    const acc = block.accounts[accountId] || { accountId, label: label || accountId, status: 'ACTIVE', isDemo: !!isDemo, current: null, versions: {} };
    if (acc.versions[rec.versionId])
      throw new BrandingError(BRANDING_ERROR.BRANDING_VERSION_NOT_FOUND, `Version "${rec.versionId}" already exists; versions are immutable.`);
    if (label) acc.label = label;
    acc.isDemo = !!isDemo || !!acc.isDemo;
    acc.versions[rec.versionId] = rec;
    acc.current = rec.versionId;
    block.accounts[accountId] = acc;
    if (!block.primary || makePrimary) block.primary = accountId;
  } else {
    const block = s[kind];
    if (block.versions[rec.versionId])
      throw new BrandingError(BRANDING_ERROR.BRANDING_VERSION_NOT_FOUND, `Version "${rec.versionId}" already exists; versions are immutable.`);
    block.versions[rec.versionId] = rec;
    block.current = rec.versionId;
  }
  return s;
}

/** ACTIVE ⇄ INACTIVE for a bank/upi account. Never deletes. */
export function setBrandingAccountStatus(store, { actor, kind, accountId, status, at }) {
  if (!at) throw new BrandingError(BRANDING_ERROR.BRANDING_VERSION_NOT_FOUND, 'Timestamp (at) is required.');
  assertBrandingEditor(actor);
  if (!MULTI_ACCOUNT_KINDS.has(kind))
    throw new BrandingError(BRANDING_ERROR.BRANDING_KIND_INVALID, `${kind} is single-slot; account status does not apply.`);
  if (status !== 'ACTIVE' && status !== 'INACTIVE')
    throw new BrandingError(BRANDING_ERROR.BRANDING_KIND_INVALID, `status must be ACTIVE or INACTIVE (got "${status}").`);
  const s = cloneBrandingStore(store);
  const acc = s[kind].accounts[accountId];
  if (!acc) throw new BrandingError(BRANDING_ERROR.BRANDING_VERSION_NOT_FOUND, `${kind} account "${accountId}" not found.`);
  acc.status = status; acc.statusChangedBy = actor.userId ?? actor.role; acc.statusChangedAt = at ?? null;
  if (status === 'INACTIVE' && s[kind].primary === accountId) {
    const next = Object.values(s[kind].accounts).find(a => a.status === 'ACTIVE' && a.accountId !== accountId);
    s[kind].primary = next ? next.accountId : null;
  }
  return s;
}

/** Choose which ACTIVE bank/upi account new quotations use by default. */
export function setPrimaryBrandingAccount(store, { actor, kind, accountId, at }) {
  if (!at) throw new BrandingError(BRANDING_ERROR.BRANDING_VERSION_NOT_FOUND, 'Timestamp (at) is required.');
  assertBrandingEditor(actor);
  if (!MULTI_ACCOUNT_KINDS.has(kind))
    throw new BrandingError(BRANDING_ERROR.BRANDING_KIND_INVALID, `${kind} is single-slot; primary does not apply.`);
  const s = cloneBrandingStore(store);
  const acc = s[kind].accounts[accountId];
  if (!acc) throw new BrandingError(BRANDING_ERROR.BRANDING_VERSION_NOT_FOUND, `${kind} account "${accountId}" not found.`);
  if (acc.status !== 'ACTIVE') throw new BrandingError(BRANDING_ERROR.BRANDING_KIND_INVALID, `${kind} account "${accountId}" is not ACTIVE.`);
  s[kind].primary = accountId;
  s[kind].primaryChangedBy = actor.userId ?? actor.role;
  s[kind].primaryChangedAt = at;
  return s;
}

/** Editor-facing summary (no mutation). */
export function describeBrandingStore(store) {
  const out = { schema: store?.schema ?? null, kinds: {} };
  for (const kind of BRANDING_KINDS) {
    const accounts = listAccounts(store, kind);
    out.kinds[kind] = {
      multiAccount: MULTI_ACCOUNT_KINDS.has(kind),
      primary: readKindAsV2(store, kind).primary,
      accounts,
      published: accounts.some(a => a.current),
      containsDemo: kindContainsDemo(store, kind),
    };
  }
  return out;
}
