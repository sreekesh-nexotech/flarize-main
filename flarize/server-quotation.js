// QUOTATION — HTTP TRANSPORT.  (Phase 3, PART H — Step 3)
//
// Transport only. Every rule lives in src/lib/quotationWorkspace.js, which in
// turn delegates to the pure assembler (quotationPayload.js) and the frozen
// engines. Nothing here calculates, validates, gates, versions or defaults.
//
// Specifically absent from this file, by design:
//   no price, no GST, no margin, no cost head, no catalog read, no engineering
//   rule, no generation gate, no version arithmetic, no clock. The gate is
//   evaluated by the service; this layer only maps its refusal onto a status
//   code and passes the failed checks through unaltered.
//
// AUTHENTICATION vs AUTHORISATION — unchanged and still explicit:
//   One credential, no user store. The session proves "an authorised operator of
//   this installation"; the acting ROLE is supplied per request in
//   x-actor-role / x-actor-user. RBAC is enforced at the service boundary
//   (src/lib/rbac.js, called inside quotationWorkspace), never here. This
//   transport cannot grant a capability and never checks one itself. P3-D is NOT
//   solved here; GET /api/quotation/session reports the limitation.
//
// PERSISTENCE:
//   The service keeps its state in Maps and freezes issued documents. This file
//   is the storage adapter: it serialises that state to JSON and rebuilds it on
//   start, re-freezing every stored document so an issued quotation is exactly
//   as immutable after a restart as before. That is (de)serialisation, not
//   versioning — the version list order and contents are whatever the service
//   wrote.

const fs = require('fs');
const path = require('path');

// R1 + R2 (2026-09-04) — approved-template renderer + loader are ESM.
// Dynamically imported once at first-use and memoized so every ISSUED
// quotation gets `document.rendererPinning` frozen at issue time.
let _approvedTemplateModules = null;
async function loadApprovedTemplateModules() {
  if (_approvedTemplateModules) return _approvedTemplateModules;
  const loader   = await import('./src/lib/approvedTemplate.loader.js');
  const renderer = await import('./src/lib/approvedTemplate.js');
  _approvedTemplateModules = {
    getCurrentApprovedTemplatePinning: loader.getCurrentApprovedTemplatePinning,
    loadPinnedApprovedTemplate:        loader.loadPinnedApprovedTemplate,
    resolveApprovedTemplatePaths:      loader.resolveApprovedTemplatePaths,
    renderQuotationHtml:               renderer.renderQuotationHtml,
    APPROVED_TEMPLATE_VERSION:         renderer.APPROVED_TEMPLATE_VERSION,
  };
  return _approvedTemplateModules;
}

/**
 * Build the rendererPinning object passed into Q.issueQuotation at issue time.
 * The four hash fields come from the CURRENT approved-template bundle's
 * .meta.json (integrity-verified by the loader). The renderer version comes
 * from the approvedTemplate.js module. All five fields become part of the
 * deep-frozen ISSUED document, enabling replay against the exact same bundle
 * even after a future Rev 2 becomes the loader's default target.
 *
 * Returns `null` when the approved-template bundle is not available on this
 * server (e.g. before it is vendored, or in a legacy environment). Issuance
 * proceeds unpinned — the old renderer still works from payload alone — and
 * a warning is logged so ops can see the reproducibility gap for that
 * issuance.
 */
async function currentRendererPinning() {
  try {
    const { getCurrentApprovedTemplatePinning, APPROVED_TEMPLATE_VERSION } = await loadApprovedTemplateModules();
    const templatePin = getCurrentApprovedTemplatePinning();
    return Object.freeze({ ...templatePin, rendererVersion: APPROVED_TEMPLATE_VERSION });
  } catch (e) {
    console.warn('[quotation] rendererPinning unavailable at issue — issuing without R1/R2 pinning. Code:',
      e.code || 'unknown', '·', e.message);
    return null;
  }
}

let Q = null;                 // ESM service layer, loaded once at startup
let RBAC = null;
let STORE = null;
let ENV = null;
let STATE_FILE = path.join(__dirname, 'data', 'quotation-state.json');
let CMS_STORE_FN = null;     // C11-H: function returning the CMS store (lazy)
let COMPANY_PROFILE_FN = null; // Company Master: function returning company quotation shape (lazy)
let TIER_DISPLAY_NAMES = null; // C6: authoritative tier display names
let INCLUSION_MATRIX = null;   // Commercial inclusion matrix
let ENERGY_CONFIG = null;      // Energy engine configuration (tariff, yield, sizing)
let SAVINGS_CONFIG = null;     // Savings engine configuration (self-consumption model)

function loadJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch (e) { return fallback; }
}

function dataPath(name) { return path.join(__dirname, 'data', name); }

/**
 * Catalog only, and only so the service's own attribute lookup can decorate ids
 * the LOCKED BOM already chose. This file never inspects it.
 */
function buildEnv() {
  return { catalog: loadJson(dataPath('catalog.json'), { categories: {} }) };
}

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

/** Store -> plain JSON. Maps become objects; nothing is transformed. */
function serialiseStore(store) {
  return {
    storeVersion: store.storeVersion,
    bomSnapshots: Object.fromEntries(store.bomSnapshots),
    commercialSnapshots: Object.fromEntries(store.commercialSnapshots),
    quotations: Object.fromEntries(store.quotations),
    documents: Object.fromEntries(store.documents),
    versionStatus: Object.fromEntries(store.versionStatus),
  };
}

/** JSON -> store. Issued documents and snapshots are re-frozen on the way in. */
function hydrateStore(saved) {
  const store = Q.createQuotationStore();
  if (!saved) return store;
  for (const [k, v] of Object.entries(saved.bomSnapshots || {})) store.bomSnapshots.set(k, deepFreeze(v));
  for (const [k, v] of Object.entries(saved.commercialSnapshots || {})) store.commercialSnapshots.set(k, deepFreeze(v));
  for (const [k, v] of Object.entries(saved.quotations || {})) store.quotations.set(k, v);
  for (const [k, v] of Object.entries(saved.documents || {})) store.documents.set(k, (v || []).map(deepFreeze));
  for (const [k, v] of Object.entries(saved.versionStatus || {})) store.versionStatus.set(k, v);
  return store;
}

function persist() {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(serialiseStore(STORE), null, 2), 'utf-8'); }
  catch (e) { console.error('[quotation] could not persist state:', e.message); }
}

function loadTierDisplayNames() {
  const raw = loadJson(dataPath('tier-display-names.json'), null);
  if (!raw || typeof raw !== 'object') return null;
  // Strip metadata keys, return only tier → display name
  const names = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!k.startsWith('_') && typeof v === 'string') names[k] = v;
  }
  return Object.keys(names).length ? names : null;
}

function loadInclusionMatrix() {
  return loadJson(dataPath('quotation-inclusions.json'), null);
}

async function init(options = {}) {
  if (options.stateFile) STATE_FILE = options.stateFile;
  if (options.getCmsStore) CMS_STORE_FN = options.getCmsStore;
  if (options.getCompanyProfile) COMPANY_PROFILE_FN = options.getCompanyProfile;
  Q = await import('./src/lib/quotationWorkspace.js');
  RBAC = await import('./src/lib/rbac.js');
  ENV = buildEnv();
  TIER_DISPLAY_NAMES = loadTierDisplayNames();
  INCLUSION_MATRIX = loadInclusionMatrix();
  // 2026-09-09 — owner-maintained quotation content (page-6 testimonials).
  // Read fresh on every payload build so an edit to the file (or a later
  // Admin editor) shows up in the next draft/issue; ISSUED documents keep
  // the frozen payload they were issued with.
  Q.setQuotationContentProvider(() => ({
    testimonials: loadJson(dataPath('quotation-testimonials.json'), null),
    // P1 (2026-09-13): published bilingual document content (server-content.js).
    document: (() => { try { const c = require('./server-content.js'); const content = c.getPublishedContent(); return content ? { version: c.getPublishedVersion(), content } : null; } catch { return null; } })(),
  }));
  ENERGY_CONFIG = loadJson(dataPath('energy-config.json'), null);
  SAVINGS_CONFIG = loadJson(dataPath('savings-config.json'), null);
  STORE = hydrateStore(loadJson(STATE_FILE, null));
  return true;
}

// actorOf is injected from server-users.js (session-derived, not header-derived).
let _actorOf;
function actorOf(req) {
  if (_actorOf) return _actorOf(req);
  // fallback: header-based resolution (test/legacy only — production always injects actorOf)
  const role = (req.headers || {})['x-actor-role'] || null;
  const userId = (req.headers || {})['x-actor-user'] || null;
  if (!role && !userId) return null;
  return { userId, role };
}

/** Service error code -> HTTP status. Mapping only; no decision is made here. */
function statusFor(err) {
  if (err?.name === 'RbacError') return 403;
  // Policy / branding editor refusals are authorisation failures (Sales etc.)
  if (err?.code === 'POLICY_EDITOR_FORBIDDEN' || err?.code === 'BRANDING_EDITOR_FORBIDDEN') return 403;
  switch (err?.code) {
    case 'QUOTATION_NOT_FOUND':
    case 'VERSION_NOT_FOUND':
    case 'BOM_SNAPSHOT_NOT_FOUND':
    case 'COMMERCIAL_SNAPSHOT_NOT_FOUND':
      return 404;
    case 'QUOTATION_EXISTS':
    case 'QUOTATION_ALREADY_ISSUED':
    case 'QUOTATION_NOT_ISSUED':
      return 409;
    case 'GENERATION_BLOCKED':
      // The quotation cannot be generated in the current state. The state, not
      // the request, is what is wrong — a conflict, not a malformed input.
      return 409;
    case 'BOM_NOT_LOCKED':
    case 'COMMERCIAL_SNAPSHOT_NOT_ISSUED':
    case 'MISSING_TIMESTAMP':
    case 'MISSING_IDENTIFIER':
      return 400;
    default:
      return err?.code ? 400 : 500;
  }
}

/**
 * Locate a Chromium binary for the server-side PDF renderer:
 *   1. PDF_CHROMIUM_PATH (explicit, e.g. a system chrome/chromium)
 *   2. Playwright's own registered browser (after `npx playwright install chromium`)
 *   3. any chromium-<build>/chrome-linux/chrome below PLAYWRIGHT_BROWSERS_PATH or ~/.cache/ms-playwright
 * Returns null when none exists (route answers 501 → browser print dialog).
 */
function findChromium(pw) {
  const envPath = process.env.PDF_CHROMIUM_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;
  try { const p = pw.chromium.executablePath(); if (p && fs.existsSync(p)) return p; } catch (_) { /* not installed */ }
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, path.join(process.env.HOME || '', '.cache', 'ms-playwright'), '/opt/pw-browsers'].filter(Boolean);
  for (const root of roots) {
    try {
      const dirs = fs.readdirSync(root).filter(d => /^chromium/.test(d)).sort().reverse();
      for (const d of dirs) {
        for (const rel of ['chrome-linux/chrome', 'chrome-linux/headless_shell', 'chrome-win/chrome.exe', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
          const cand = path.join(root, d, rel);
          if (fs.existsSync(cand)) return cand;
        }
      }
    } catch (_) { /* root missing */ }
  }
  for (const sys of ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable']) {
    if (fs.existsSync(sys)) return sys;
  }
  return null;
}

function register(addRoute, { send, parseBody, isAdmin, isAuthenticated: injectedIsAuthenticated, actorOf: injectedActorOf }) {
  if (injectedActorOf) _actorOf = injectedActorOf;
  const _isAuth = injectedIsAuthenticated || isAdmin;
  const guard = (handler) => async (req, res, params, query) => {
    if (!_isAuth(req)) return send(res, 401, { error: 'Unauthorized' });
    if (!Q) return send(res, 503, { error: 'Quotation layer not initialised yet' });
    try {
      await handler(req, res, params, query);
    } catch (err) {
      // A malformed body never reaches the service; it is a transport fault.
      if (!err?.code && /Invalid JSON|Body too large/i.test(err?.message || ''))
        return send(res, 400, { error: err.message, code: 'MALFORMED_REQUEST', detail: null });

      const body = { error: err.message, code: err?.code || null, detail: err?.detail ?? null };
      // Gate refusals carry their checks through unaltered — the caller must be
      // able to see exactly what blocked, not a generic failure.
      if (err?.detail?.failedChecks) body.failedChecks = err.detail.failedChecks;
      if (err?.detail?.reasons) body.reasons = err.detail.reasons;
      send(res, statusFor(err), body);
    }
  };

  const at = (b) => b.at || null;              // caller-supplied; the service refuses null
  const version = (raw) => Number(raw);        // path segment -> the service's version number

  // ---- session -----------------------------------------------------------
  addRoute('GET', '/api/quotation/session', guard(async (req, res) => {
    const actor = actorOf(req);
    send(res, 200, {
      ...Q.session(actor),
      actor,
      roles: RBAC.ALL_ROLES,
      rbacVersion: RBAC.RBAC_VERSION,
      identityModel: 'AUTHENTICATED_USER',
      identityNote: 'Per-user identity is active (server-users.js). The actor { userId, role } is ' +
        'derived from the authenticated session server-side; client-supplied x-actor-* headers are ' +
        'ignored. RBAC is enforced at the service boundary against the session-derived role.',
    });
  }));

  addRoute('POST', '/api/quotation/reload', guard(async (req, res) => {
    ENV = buildEnv();
    send(res, 200, { ok: true });
  }));

  // ---- validity policy (Admin + Project Head) — conformance §18, 2026-09-07 ---
  // Effective-period validity is resolved at issue time from
  // data/quotation-policy.json (quotationPolicy.resolveEffectiveValidity). These
  // routes are the write surface that module documented but never had. RBAC is
  // enforced inside the module (assertPolicyEditor: ADMIN + PROJECT_HEAD; Sales
  // refused). Policies are append-only; issued quotations keep their frozen
  // validityDays regardless of later policy changes.
  const POLICY_FILE = dataPath('quotation-policy.json');
  const savePolicy = (store) => fs.writeFileSync(POLICY_FILE, JSON.stringify(store, null, 2) + '\n', 'utf-8');
  const policyMod = () => import('./src/lib/quotationPolicy.js');

  // The transport has no clock (locked contract): `at` is always supplied by the
  // caller — request body for writes, `?at=` for the read — and the service
  // refuses a missing timestamp. `activeNow` is only resolved when `at` is given.
  addRoute('GET', '/api/quotation/policy', guard(async (req, res, p, query) => {
    const P = await policyMod();
    send(res, 200, P.describePolicyStore(loadJson(POLICY_FILE, null), query?.get?.('at') || null));
  }));

  addRoute('POST', '/api/quotation/policy/policies', guard(async (req, res) => {
    const P = await policyMod();
    const b = await parseBody(req);
    const next = P.publishPolicy(loadJson(POLICY_FILE, null), { actor: actorOf(req), policy: b.policy || b, at: at(b) });
    savePolicy(next);
    send(res, 200, P.describePolicyStore(next, at(b)));
  }));

  addRoute('POST', '/api/quotation/policy/policies/:policyId/status', guard(async (req, res, p) => {
    const P = await policyMod();
    const b = await parseBody(req);
    const next = P.setPolicyStatus(loadJson(POLICY_FILE, null), { actor: actorOf(req), policyId: p.policyId, status: b.status, reason: b.reason ?? null, at: at(b) });
    savePolicy(next);
    send(res, 200, P.describePolicyStore(next, at(b)));
  }));

  addRoute('PUT', '/api/quotation/policy/default', guard(async (req, res) => {
    const P = await policyMod();
    const b = await parseBody(req);
    const next = P.setDefaultValidityDays(loadJson(POLICY_FILE, null), { actor: actorOf(req), defaultDays: b.defaultDays === null ? null : Number(b.defaultDays), at: at(b) });
    savePolicy(next);
    send(res, 200, P.describePolicyStore(next, at(b)));
  }));

  // ---- branding: bank / upi / signature / seal (Admin + Project Head) — §19 ---
  // Multi-account bank + UPI, single-slot signature + seal. Versions immutable;
  // accounts never deleted. RBAC inside the module (assertBrandingEditor).
  // Production issuance still refuses isDemo:true branding (commercialFreeze).
  const BRANDING_FILE = dataPath('quotation-branding-state.json');
  const saveBranding = (store) => fs.writeFileSync(BRANDING_FILE, JSON.stringify(store, null, 2) + '\n', 'utf-8');
  const brandingMod = () => import('./src/lib/quotationBranding.js');

  addRoute('GET', '/api/quotation/branding', guard(async (req, res) => {
    const B = await brandingMod();
    B.assertBrandingEditor(actorOf(req));   // editors only — bank details are not for Sales
    send(res, 200, B.describeBrandingStore(loadJson(BRANDING_FILE, null)));
  }));

  addRoute('POST', '/api/quotation/branding/:kind/versions', guard(async (req, res, p) => {
    const B = await brandingMod();
    const b = await parseBody(req);
    const next = B.publishBrandingVersion(loadJson(BRANDING_FILE, null), {
      actor: actorOf(req), kind: p.kind, accountId: b.accountId ?? null, label: b.label ?? null,
      isDemo: b.isDemo === true, values: b.values, versionId: b.versionId ?? null, makePrimary: b.makePrimary === true,
      at: at(b),
    });
    saveBranding(next);
    send(res, 200, B.describeBrandingStore(next));
  }));

  addRoute('POST', '/api/quotation/branding/:kind/accounts/:accountId/status', guard(async (req, res, p) => {
    const B = await brandingMod();
    const b = await parseBody(req);
    const next = B.setBrandingAccountStatus(loadJson(BRANDING_FILE, null), { actor: actorOf(req), kind: p.kind, accountId: p.accountId, status: b.status, at: at(b) });
    saveBranding(next);
    send(res, 200, B.describeBrandingStore(next));
  }));

  addRoute('POST', '/api/quotation/branding/:kind/accounts/:accountId/primary', guard(async (req, res, p) => {
    const B = await brandingMod();
    const b = await parseBody(req);
    const next = B.setPrimaryBrandingAccount(loadJson(BRANDING_FILE, null), { actor: actorOf(req), kind: p.kind, accountId: p.accountId, at: at(b) });
    saveBranding(next);
    send(res, 200, B.describeBrandingStore(next));
  }));

  // ---- snapshot registration ---------------------------------------------
  addRoute('POST', '/api/quotation/bom-snapshots', guard(async (req, res) => {
    const b = await parseBody(req);
    const out = Q.registerBomSnapshot(STORE, actorOf(req), { bomSnapshotId: b.bomSnapshotId, snapshot: b.snapshot ?? null });
    persist();
    send(res, 201, { bomSnapshotId: b.bomSnapshotId, status: out.status });
  }));

  addRoute('POST', '/api/quotation/commercial-snapshots', guard(async (req, res) => {
    const b = await parseBody(req);
    const out = Q.registerCommercialSnapshot(STORE, actorOf(req), { snapshot: b.snapshot ?? null });
    persist();
    send(res, 201, { snapshotId: out.snapshotId, status: out.status });
  }));

  // ---- quotations --------------------------------------------------------
  addRoute('GET', '/api/quotation/quotations', guard(async (req, res) =>
    send(res, 200, { quotations: Q.listQuotations(STORE, actorOf(req)) })));

  addRoute('POST', '/api/quotation/quotations', guard(async (req, res) => {
    const b = await parseBody(req);
    const out = Q.createDraft(STORE, actorOf(req), { ...b, at: at(b) });
    persist();
    send(res, 201, out);
  }));

  addRoute('GET', '/api/quotation/quotations/:id', guard(async (req, res, p) =>
    send(res, 200, Q.getQuotation(STORE, actorOf(req), p.id))));

  addRoute('PATCH', '/api/quotation/quotations/:id', guard(async (req, res, p) => {
    const b = await parseBody(req);
    const out = Q.setQuotationFields(STORE, actorOf(req), p.id, b.fields || {}, at(b));
    persist();
    send(res, 200, out);
  }));

  // ---- payload + gate ----------------------------------------------------
  // Reproducibility contract (V4 quotation-finalization Phase 2D):
  //   ISSUED quotations MUST return the frozen document.payload stored at
  //   issuance. Live rebuild is only permitted for DRAFT/unissued quotations.
  //   This prevents changes to company profile, CMS, catalog, tier names,
  //   finance/energy/savings config, etc. from silently changing what a
  //   customer already received.
  addRoute('GET', '/api/quotation/quotations/:id/payload', guard(async (req, res, p) => {
    const actor = actorOf(req);
    const issued = Q.getIssuedPayload(STORE, actor, p.id);
    if (issued) return send(res, 200, { payload: issued, source: 'ISSUED_SNAPSHOT' });
    const payload = Q.buildPayload(STORE, actor, p.id, { catalog: ENV.catalog, cmsStore: CMS_STORE_FN ? CMS_STORE_FN() : null, companyProfile: COMPANY_PROFILE_FN ? COMPANY_PROFILE_FN() : null, tierDisplayNames: TIER_DISPLAY_NAMES, inclusionMatrix: INCLUSION_MATRIX, energyConfig: ENERGY_CONFIG, savingsConfig: SAVINGS_CONFIG });
    return send(res, 200, { payload, source: 'DRAFT_LIVE_BUILD' });
  }));

  addRoute('GET', '/api/quotation/quotations/:id/gate', guard(async (req, res, p) =>
    send(res, 200, Q.checkGenerationGate(STORE, actorOf(req), p.id))));

  // ---- issue + revise ----------------------------------------------------
  addRoute('POST', '/api/quotation/quotations/:id/issue', guard(async (req, res, p) => {
    const b = await parseBody(req);
    // R1 + R2 wiring: compute the approved-template bundle + renderer version
    // pinning ONCE for this issuance and pass it into Q.issueQuotation so the
    // resulting frozen document carries `rendererPinning` alongside
    // `cmsPageVersions`. On loader failure this returns null and issuance
    // proceeds unpinned (legacy path) — the warning is logged in
    // currentRendererPinning().
    const rendererPinning = await currentRendererPinning();
    // P0-2 fix: assemble commercialFreezeInputs on the direct /issue path.
    // Callers may supply brandingOverrides, validityOverrideDays, and the
    // per-issue bom shape via the POST body. When absent, we still freeze
    // branding + validity from the current stores on disk so the issued
    // document carries the Phase F–J 10-domain snapshot.
    const brandingStore = loadJson(dataPath('quotation-branding-state.json'), null);
    const policyStore   = loadJson(dataPath('quotation-policy.json'), null);
    const costConfig    = loadJson(dataPath('cost-config.json'), null);
    const productionMode = String(process.env.PRODUCTION_MODE || '').toLowerCase() === 'true';
    const commercialFreezeInputs = {
      bom: b.bom || null,
      project: b.project || {},
      transportationConfig: costConfig?.transportation || null,
      commercialSnapshot: b.commercialSnapshot || null,
      subsidyResult: b.subsidyResult || null,
      brandingStore,
      brandingOverrides: b.brandingOverrides || {},
      policy: policyStore,
      validityOverrideDays: b.validityOverrideDays ?? null,
      packageProfile: b.packageProfile || null,
      productionMode,
    };
    const out = Q.issueQuotation(STORE, actorOf(req), p.id, { at: at(b), catalog: ENV.catalog, cmsStore: CMS_STORE_FN ? CMS_STORE_FN() : null, companyProfile: COMPANY_PROFILE_FN ? COMPANY_PROFILE_FN() : null, tierDisplayNames: TIER_DISPLAY_NAMES, inclusionMatrix: INCLUSION_MATRIX, energyConfig: ENERGY_CONFIG, savingsConfig: SAVINGS_CONFIG, rendererPinning, commercialFreezeInputs });
    persist();
    send(res, 201, out);
  }));

  addRoute('POST', '/api/quotation/quotations/:id/revise', guard(async (req, res, p) => {
    const b = await parseBody(req);
    const out = Q.createRevision(STORE, actorOf(req), p.id, { at: at(b), changes: b.changes || {} });
    persist();
    send(res, 200, out);
  }));

  // ---- versions ----------------------------------------------------------
  addRoute('GET', '/api/quotation/quotations/:id/versions', guard(async (req, res, p) =>
    send(res, 200, { versions: Q.listVersions(STORE, actorOf(req), p.id) })));

  // `getVersion` returns an in-process handle `document` — the stored frozen
  // object itself, so a caller can prove identity by reference. A reference
  // proof does not survive JSON, and for an actor without COST_VIEW that handle
  // is the UNREDACTED document. It is therefore not serialised onto the wire:
  // the redacted view the service built for this actor is what is sent, and
  // immutability is proven over HTTP by the /verify route instead.
  addRoute('GET', '/api/quotation/quotations/:id/versions/:v', guard(async (req, res, p) => {
    const { document, ...wire } = Q.getVersion(STORE, actorOf(req), p.id, version(p.v));
    send(res, 200, wire);
  }));

  addRoute('GET', '/api/quotation/quotations/:id/versions/:v/verify', guard(async (req, res, p) =>
    send(res, 200, Q.verifyImmutability(STORE, actorOf(req), p.id, version(p.v)))));

  // ---- rendered HTML  (Phase G G1 — Q1 Option A) -------------------------
  // Wire the AUTHORITATIVE server renderer to HTTP. This does NOT create a
  // competing renderer — it invokes the existing approvedTemplate.js renderer
  // against the exact bundle pinned into the ISSUED document.
  //
  // REPRODUCIBILITY CONTRACT (locked with R1 + R2 + R3):
  //   1. The document's `rendererPinning` is authoritative. loadPinnedApprovedTemplate()
  //      resolves the on-disk bundle at the pinned name/version AND asserts
  //      its bundle sha256 matches what was recorded at issue. A mismatch
  //      fails loud rather than silently rendering a different version.
  //   2. Additionally, the CURRENT loader default (what renderQuotationHtml
  //      itself will read internally) MUST equal the pinned bundle. Once a
  //      future Rev 2 becomes the default, historical v1-pinned quotations
  //      will render through their pinned bundle via a caller-supplied path,
  //      but until that landing is in place we refuse to render rather than
  //      let the current default silently substitute for the pin.
  //   3. Callers with COST_VIEW get the fully populated payload; other roles
  //      get the redacted view built by Q.getVersion — the renderer sees the
  //      exact payload the actor is authorised to see.
  //
  // Query flag:
  //   `?relaxPage3=1` — omit the persistent Page-3 placeholder blocker so a
  //   fully-substituted quotation renders READY. Default keeps the blocker
  //   (matches the architectural gap the renderer documents).
  addRoute('GET', '/api/quotation/quotations/:id/rendered-html', guard(async (req, res, p, query) => {
    const actor = actorOf(req);
    const v = version(p.v || query?.v);
    // The version query is optional — default to the quotation's current
    // ISSUED version. If none is issued yet, the service refuses via its own
    // status flow when getVersion is called with a missing version.
    const versions = Q.listVersions(STORE, actor, p.id);
    const target = Number.isFinite(v) ? v : (versions.find(x => x.status === 'ISSUED')?.version ?? null);
    if (target == null)
      return send(res, 409, { error: `Quotation ${p.id} has no ISSUED version to render.`, code: 'QUOTATION_NOT_ISSUED', detail: { quotationId: p.id } });

    // Get the full frozen document handle. The renderer needs the payload
    // exactly as it was frozen at issue — never a re-built one — for
    // reproducibility (G5).
    const view = Q.getVersion(STORE, actor, p.id, target);
    const doc  = view.document || view; // COST_VIEW returns {..., document}; others return the wire view.
    const payload = doc.payload;
    const pinning = doc.rendererPinning;

    if (!pinning)
      return send(res, 409, {
        error: `Quotation ${p.id} v${target} was issued WITHOUT rendererPinning. Legacy documents cannot be replayed through the pin-enforced HTTP renderer.`,
        code:  'RENDERER_PIN_MISSING',
        detail: { quotationId: p.id, version: target },
      });

    let mods;
    try { mods = await loadApprovedTemplateModules(); }
    catch (e) {
      return send(res, 503, { error: `Renderer modules unavailable: ${e.message}`, code: 'RENDERER_UNAVAILABLE', detail: null });
    }

    // (1) Integrity: on-disk pinned bundle must match its recorded hash.
    let pinned;
    try { pinned = mods.loadPinnedApprovedTemplate(pinning); }
    catch (e) {
      return send(res, 409, { error: e.message, code: e.code || 'RENDERER_PIN_INTEGRITY', detail: e.detail || null });
    }

    // (2) Phase H H4 — pin-path renderer routing. Resolve the pinned bundle's
    // on-disk paths and pass them into renderQuotationHtml, so the pinned
    // document renders against its pinned bundle regardless of whether a
    // newer bundle (Rev 2) is the loader's current default. The integrity
    // gate above already verified the on-disk bundle matches the recorded
    // pin, so this path never silently substitutes.
    let templatePaths;
    try { templatePaths = mods.resolveApprovedTemplatePaths({ name: pinning.name, version: pinning.version }); }
    catch (e) {
      return send(res, 409, { error: e.message, code: e.code || 'RENDERER_PIN_PATH_UNRESOLVED', detail: e.detail || null });
    }

    // Informational: what the loader's CURRENT default is, so a caller can see
    // whether it matches the pin. No longer used to gate rendering.
    let currentPin = null;
    try { currentPin = mods.getCurrentApprovedTemplatePinning(); } catch { /* no current default */ }

    // (3) Render against the PINNED bundle. `strict:false` returns HTML plus a
    // status object even when the persistent Page-3 blocker is present
    // (architectural gap); with `?relaxPage3=1` the Page-3 blocker is
    // suppressed and READY is returned.
    const relaxPage3 = String((query || {}).relaxPage3 || '') === '1';
    let rendered;
    try {
      rendered = mods.renderQuotationHtml(payload, {
        strict: false,
        includePage3Blocker: !relaxPage3,
        templatePaths,
      });
    } catch (e) {
      return send(res, 500, { error: e.message, code: e.code || 'RENDER_FAILED', detail: e.detail || null });
    }

    // Envelope carries the HTML and the reproducibility proof the client can
    // verify against `document.rendererPinning`. G5 — same pin + same payload
    // must produce the same HTML deterministically; both fields are surfaced.
    send(res, 200, {
      quotationId: p.id,
      version: target,
      rendererPinning: pinning,
      currentPin,
      pinnedBundle: {
        name: pinned.meta.name,
        version: pinned.meta.version,
        bundleSha256: pinned.meta.bundleSha256,
        templateSha256: pinned.meta.templateSha256,
        manifestSha256: pinned.meta.manifestSha256 || null,
      },
      renderStatus: rendered.status,
      meta: rendered.meta,
      html: rendered.html,
    });
  }));

  // ---- quotation content: testimonials (2026-09-10) ---------------------------
  // Simple editor backing store for page 6. Admin (and Project Head) read;
  // Admin writes. Values are copied into every NEW draft/issue; ISSUED
  // documents keep their frozen payload.
  const TESTIMONIALS_FILE = dataPath('quotation-testimonials.json');
  addRoute('GET', '/api/quotation-content/testimonials', guard(async (req, res) => {
    const actor = actorOf(req);
    if (!['ADMIN', 'PROJECT_HEAD', 'SALES_HEAD'].includes(actor?.role)) return send(res, 403, { error: 'Not allowed for this role', code: 'ROLE_DENIED' });
    send(res, 200, loadJson(TESTIMONIALS_FILE, { intro: null, entries: [], video: null }));
  }));
  addRoute('PUT', '/api/quotation-content/testimonials', guard(async (req, res) => {
    const actor = actorOf(req);
    // 2026-09-13 P1 (owner): Admin OR Project Head maintain the three testimonials.
    if (!['ADMIN', 'PROJECT_HEAD'].includes(actor?.role)) return send(res, 403, { error: 'Only Admin or Project Head edits quotation content', code: 'ROLE_DENIED' });
    const b = await parseBody(req);
    const str = (v, max = 400) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
    const num = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
    const entries = (Array.isArray(b.entries) ? b.entries : []).slice(0, 3)
      .map(t => ({ name: str(t?.name, 80), place: str(t?.place, 80), systemKw: num(t?.systemKw), installedOn: str(t?.installedOn, 40), quote: str(t?.quote, 600), billBefore: num(t?.billBefore), billAfter: num(t?.billAfter), monthlySaving: num(t?.monthlySaving), photoUri: str(t?.photoUri, 300) }))
      .filter(t => t.name && t.quote);
    const video = b.video && typeof b.video === 'object' && str(b.video.title, 120)
      ? { title: str(b.video.title, 120), text: str(b.video.text, 300), link: str(b.video.link, 200), qrImageUri: str(b.video.qrImageUri, 300) }
      : { title: null, text: null, link: null, qrImageUri: null };
    const current = loadJson(TESTIMONIALS_FILE, {});
    const out = { _note: current._note || 'Customer testimonials printed on quotation page 6 — edit in Admin → Quotation content.', intro: str(b.intro, 300), entries, video, updatedBy: actor.userId, updatedAt: b.at || null };
    fs.writeFileSync(TESTIMONIALS_FILE, JSON.stringify(out, null, 2) + '\n');
    send(res, 200, out);
  }));

  // ---- server-rendered PDF (2026-09-09) -------------------------------------
  // The customer PDF is produced by headless Chromium on the server from the
  // SAME quotation-document.html the browser shows, so every user gets an
  // identical A4 file regardless of their browser (Firefox has no CSS zoom and
  // adds headers/footers/margins in its print dialog — the owner's first PDF).
  // Falls back with 501 when Playwright/Chromium is not installed on the host;
  // the page then opens the browser print dialog instead.
  addRoute('GET', '/api/quotation/quotations/:id/pdf', guard(async (req, res, p, query) => {
    const actor = actorOf(req);
    const versions = Q.listVersions(STORE, actor, p.id);
    const v = Number(query?.v);
    const target = Number.isFinite(v) && v > 0 ? v : (versions.find(x => x.status === 'ISSUED')?.version ?? null);
    if (target == null)
      return send(res, 409, { error: `Quotation ${p.id} has no ISSUED version to print.`, code: 'QUOTATION_NOT_ISSUED', detail: { quotationId: p.id } });
    const view = Q.getVersion(STORE, actor, p.id, target);
    const payload = (view.document || view).payload || {};
    const clean = (x) => String(x ?? '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const sysType = payload.system?.systemType;
    const sys = sysType === 'hybrid' ? 'Hybrid' : sysType === 'ongrid' ? 'OnGrid' : clean(sysType);
    const parts = [clean(payload.customer?.name || payload.customer?.customerName), sys, payload.system?.systemSizeKw != null ? `${payload.system.systemSizeKw}kW` : '', clean(payload.quotation?.quotationNumber)].filter(Boolean);
    const fileNameBase = (parts.length === 4 ? parts.join('_') : `Flarize_Solar_Quotation_${clean(p.id)}`);
    let fileName = fileNameBase + '.pdf'; // suffixed below when a page subset is requested

    let pw;
    try { pw = require('playwright'); }
    catch {
      return send(res, 501, { error: 'Server PDF renderer is not installed on this host (npm i -D playwright && npx playwright install chromium). Use the browser print dialog instead.', code: 'PDF_RENDERER_UNAVAILABLE', detail: null });
    }
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '') || String(query?.token || '');
    const port = req.socket?.localPort || process.env.PORT || 4800;
    // P2 (2026-09-13): ?pages=accounts (1,5,7,8) or an explicit list → subset PDF for Accounts / Documentation.
    const pagesRaw = String(query?.get?.('pages') ?? query?.pages ?? '').trim().toLowerCase();
    const pagesOk = pagesRaw === 'accounts' || /^\d{1,2}(,\d{1,2})*$/.test(pagesRaw);
    const url = `http://127.0.0.1:${port}/quotation-document.html?id=${encodeURIComponent(p.id)}${pagesOk ? `&pages=${encodeURIComponent(pagesRaw)}` : ''}`;
    if (pagesOk) fileName = fileNameBase + (pagesRaw === 'accounts' ? '_Accounts' : '_Pages') + '.pdf';
    let browser = null;
    try {
      browser = await pw.chromium.launch({
        executablePath: findChromium(pw) || undefined,
        args: ['--no-sandbox', '--disable-gpu', '--font-render-hinting=none'],
      });
      const page = await browser.newPage({ viewport: { width: 900, height: 1300 }, deviceScaleFactor: 1 });
      await page.addInitScript((t) => { try { sessionStorage.setItem('gr_session_token', t); } catch (_) {} }, token);
      const pageErrors = [];
      page.on('pageerror', (e) => pageErrors.push(String(e?.message || e)));
      await page.goto(url, { waitUntil: 'load', timeout: 60000 });
      let readyErr = null;
      try { await page.waitForFunction(() => window.__quotationReady === true, null, { timeout: 60000 }); }
      catch (e) { readyErr = e; }
      // The page's own error banner beats a generic "renderer failed" — surface
      // it (and any uncaught script error) so the cause is visible, not a 501.
      const err = await page.evaluate(() => (document.getElementById('q-error')?.textContent || '').trim()).catch(() => '');
      if (err) throw Object.assign(new Error(`Quotation page reported: ${err}`), { code: 'PDF_PAGE_ERROR' });
      if (readyErr) {
        const why = pageErrors.length ? ` — script error: ${pageErrors[0]}` : ' — page never signalled __quotationReady (fonts/images still pending?)';
        throw Object.assign(new Error(`Quotation page did not become ready${why}`), { code: 'PDF_PAGE_ERROR' });
      }
      await page.emulateMedia({ media: 'print' });
      const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Length': pdf.length,
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store',
      });
      res.end(pdf);
    } catch (e) {
      if (e.code === 'PDF_PAGE_ERROR') return send(res, 500, { error: e.message, code: e.code, detail: null });
      return send(res, 501, { error: `Server PDF renderer failed to start (${e.message}). Use the browser print dialog instead.`, code: 'PDF_RENDERER_UNAVAILABLE', detail: null });
    } finally {
      if (browser) { try { await browser.close(); } catch (_) {} }
    }
  }));
}

module.exports = { init, register, getStore: () => STORE, persist };
