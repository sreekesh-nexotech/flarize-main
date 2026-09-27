// PROJECT HEAD WORKSPACE — HTTP TRANSPORT.  (Phase 3, PART C/D/E/G)
//
// Transport only. Every rule lives in src/lib/projectWorkspace.js, which in turn
// delegates to the frozen engines. Nothing here computes, validates or defaults
// anything, and no route may write a commercial or engineering value directly.
//
// AUTHENTICATION vs AUTHORISATION — stated plainly, not glossed over:
//   The existing deployment has ONE credential (ADMIN_PASSWORD) and no user
//   store. So the session proves "an authorised operator of this installation",
//   and the acting ROLE is supplied per request. RBAC is genuinely enforced at
//   the service boundary (src/lib/rbac.js), but until a per-user identity
//   decision is made the role is operator-asserted, not identity-proven.
//   This limitation is reported by GET /api/workspace/session and is a pending
//   decision, NOT a silently accepted hole.

const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, 'data', 'workspace-state.json');

let W = null, RBAC = null;          // ESM engines, loaded once at startup
let PROJ = null;                    // packageProjection — hydrate + visibleForRuntime
let ENV = null;
let STORE = null;

function loadJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch (e) { return fallback; }
}

function dataPath(name) { return path.join(__dirname, 'data', name); }

/** Rebuild the engine environment from disk. Never fabricates a missing file. */
function buildEnv() {
  const catalog = loadJson(dataPath('catalog.json'), { categories: {} });
  const costConfig = loadJson(dataPath('cost-config.json'), {});
  const rawPackages = loadJson(dataPath('packages.proposed.json'), { packages: [] });
  // Phase 3 V4 — env.packageRegistry is the runtime-visible slice: only
  // APPROVED, non-superseded, non-archived records reach the engines that
  // read this field (salesOrchestrator.findApprovedPackage,
  // projectWorkspace.selectPackage, etc.). PROJ is loaded in init() so on
  // the first call before init returns, the raw registry is used.
  const packageRegistry = PROJ
    ? PROJ.visibleForRuntime(PROJ.hydrateRegistry(rawPackages))
    : rawPackages;
  return {
    catalog,
    catalogVersion: costConfig.sourceCatalogVersion || null,
    batteryMaster: (loadJson(dataPath('battery-master.json'), {}) || {}).batteries || {},
    packageRegistry,
    costConfig,
    // Absent files stay absent. An empty price master means the Cost Engine
    // reports LANDED_COST_NOT_CONFIGURED — which is the truth, not a zero.
    priceMaster: loadJson(dataPath('procurement-price-master.json'), {}),
    rateCard: loadJson(dataPath('project-rate-card.json'), null),
    historyStore: loadJson(dataPath('commercial-history.json'), null),
    procurementPriceVersion: costConfig.procurement?.purchasePriceVersion ?? null,
    landedCostVersion: costConfig.procurement?.landedCostVersion ?? null,
  };
}

function persist() {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(STORE, null, 2), 'utf-8'); }
  catch (e) { console.error('[workspace] could not persist state:', e.message); }
}

// PART F — Procurement. Additive: a separate transport module with its own
// state file. Nothing above is modified. Its commit hook rebuilds ENV so a new
// landed-cost version reaches the (unmodified) Cost Engine.
const procurement = require('./server-procurement.js');

// PART H — Quotation. Additive in the same shape: a separate transport module
// with its own state file. Nothing above is modified.
const quotation = require('./server-quotation.js');

// C11-G — CMS. Same pattern: a separate transport module. Routes live under
// /api/cms/* and share no state with the workspace routes above.
const cms = require('./server-cms.js');

async function init() {
  W = await import('./src/lib/projectWorkspace.js');
  RBAC = await import('./src/lib/rbac.js');
  PROJ = await import('./src/lib/packageProjection.js');
  ENV = buildEnv();
  STORE = loadJson(STATE_FILE, null) || W.createWorkspaceStore();
  if (!STORE.projects) STORE.projects = {};
  await procurement.init({ onCommit: () => { ENV = buildEnv(); } });
  await cms.init();
  const companyModule = require('./server-company.js');
  await quotation.init({ getCmsStore: () => cms.getStore(), getCompanyProfile: () => companyModule.getQuotationCompanyProfile() });
  return true;
}

// actorOf is injected from server-users.js (session-derived, not header-derived).
let _actorOf;
function actorOf(req) {
  if (_actorOf) return _actorOf(req);
  const role = (req.headers || {})['x-actor-role'] || null;
  const userId = (req.headers || {})['x-actor-user'] || null;
  if (!role && !userId) return null;
  return { userId, role };
}

function register(addRoute, { send, parseBody, isAdmin, isAuthenticated: injectedIsAuthenticated, actorOf: injectedActorOf }) {
  if (injectedActorOf) _actorOf = injectedActorOf;
  const _isAuth = injectedIsAuthenticated || isAdmin;
  const guard = (handler) => async (req, res, params, query) => {
    if (!_isAuth(req)) return send(res, 401, { error: 'Unauthorized' });
    if (!W) return send(res, 503, { error: 'Workspace layer not initialised yet' });
    try {
      await handler(req, res, params, query);
    } catch (err) {
      const code = err?.code || null;
      const status = err?.name === 'RbacError' ? 403
        : code === 'PROJECT_NOT_FOUND' || code === 'PACKAGE_NOT_FOUND' ? 404
        : code ? 400 : 500;
      send(res, status, { error: err.message, code, detail: err.detail ?? null });
    }
  };

  const at = (body) => body.at || null;      // caller-supplied; engines refuse null

  // ---- session / capabilities -------------------------------------------
  addRoute('GET', '/api/workspace/session', guard(async (req, res) => {
    const actor = actorOf(req);
    send(res, 200, {
      roles: RBAC.ALL_ROLES,
      actor,
      capabilities: actor.role ? RBAC.capabilitiesOf(actor.role) : [],
      capabilityMatrix: RBAC.CAPABILITY_MATRIX,
      rbacVersion: RBAC.RBAC_VERSION,
      workspaceVersion: W.WORKSPACE_VERSION,
      identityModel: 'AUTHENTICATED_USER',
      identityNote: 'Per-user identity is active (server-users.js). The actor { userId, role } is ' +
        'derived from the authenticated session server-side; client-supplied x-actor-* headers are ' +
        'ignored. RBAC is enforced at the service boundary against the session-derived role.',
    });
  }));

  addRoute('POST', '/api/workspace/reload', guard(async (req, res) => {
    ENV = buildEnv();
    send(res, 200, { ok: true, catalogVersion: ENV.catalogVersion });
  }));

  // ---- projects ----------------------------------------------------------
  addRoute('GET', '/api/workspace/projects', guard(async (req, res) =>
    send(res, 200, { projects: W.listProjects(STORE, { actor: actorOf(req) }) })));

  addRoute('POST', '/api/workspace/projects', guard(async (req, res) => {
    const b = await parseBody(req);
    const out = W.createProject(STORE, { actor: actorOf(req), projectId: b.projectId, customer: b.customer ?? null, at: at(b) });
    persist();
    send(res, 201, out);
  }));

  addRoute('GET', '/api/workspace/projects/:id', guard(async (req, res, p) =>
    send(res, 200, W.openProject(STORE, { actor: actorOf(req), projectId: p.id }))));

  addRoute('PATCH', '/api/workspace/projects/:id', guard(async (req, res, p) => {
    const b = await parseBody(req);
    const out = W.setProjectConfiguration(STORE, { actor: actorOf(req), projectId: p.id, ...b });
    persist();
    send(res, 200, out);
  }));

  // ---- packages ----------------------------------------------------------
  addRoute('GET', '/api/workspace/packages', guard(async (req, res, p, q) =>
    send(res, 200, {
      packages: W.listPackages(ENV, {
        actor: actorOf(req),
        sysType: q.get('sysType'), sizeKw: q.get('sizeKw'),
        phase: q.get('phase'), tier: q.get('tier'),
      }),
    })));

  addRoute('POST', '/api/workspace/projects/:id/package', guard(async (req, res, p) => {
    const b = await parseBody(req);
    const out = W.selectPackage(STORE, ENV, { actor: actorOf(req), projectId: p.id, packageId: b.packageId, at: at(b) });
    persist();
    send(res, 200, out);
  }));

  // ---- BOM ---------------------------------------------------------------
  addRoute('GET', '/api/workspace/projects/:id/bom', guard(async (req, res, p) =>
    send(res, 200, W.viewBom(STORE, ENV, { actor: actorOf(req), projectId: p.id }))));

  addRoute('GET', '/api/workspace/components', guard(async (req, res, p, q) => {
    // ?role=<CHECKER_ROLE> → selectable components for that role (project BOM editing)
    // ?q=<text>            → free-text search across every role (PH template authoring)
    if (q.get('q') != null && !q.get('role')) {
      return send(res, 200, { q: q.get('q'), components: W.searchComponents(ENV, { actor: actorOf(req), q: q.get('q') }) });
    }
    send(res, 200, { role: q.get('role'), components: W.availableComponents(ENV, { actor: actorOf(req), role: q.get('role') }) });
  }));

  addRoute('PUT', '/api/workspace/projects/:id/bom/line', guard(async (req, res, p) => {
    const b = await parseBody(req);
    const out = W.editBomComponent(STORE, ENV, {
      actor: actorOf(req), projectId: p.id, role: b.role, componentId: b.componentId,
      quantity: b.quantity, reason: b.reason ?? null, at: at(b) });
    persist();
    send(res, 200, out);
  }));

  addRoute('PUT', '/api/workspace/projects/:id/bom/quantity', guard(async (req, res, p) => {
    const b = await parseBody(req);
    const out = W.editBomQuantity(STORE, ENV, { actor: actorOf(req), projectId: p.id, role: b.role, quantity: b.quantity, at: at(b) });
    persist();
    send(res, 200, out);
  }));

  addRoute('DELETE', '/api/workspace/projects/:id/bom/:role', guard(async (req, res, p, q) => {
    const out = W.removeBomRole(STORE, ENV, {
      actor: actorOf(req), projectId: p.id, role: p.role,
      reason: q.get('reason'), at: q.get('at') });
    persist();
    send(res, 200, out);
  }));

  // ---- engineering checker ----------------------------------------------
  addRoute('POST', '/api/workspace/projects/:id/check', guard(async (req, res, p) => {
    const b = await parseBody(req);
    const out = W.runChecker(STORE, ENV, {
      actor: actorOf(req), projectId: p.id, at: at(b),
      upgrade: b.upgrade ?? null, futureUpgrade: !!b.futureUpgrade });
    persist();
    send(res, 200, out);
  }));

  addRoute('GET', '/api/workspace/projects/:id/check', guard(async (req, res, p) =>
    send(res, 200, W.getValidation(STORE, ENV, { actor: actorOf(req), projectId: p.id }) || { status: null, findings: [] })));

  // ---- lock + snapshot ---------------------------------------------------
  addRoute('POST', '/api/workspace/projects/:id/lock', guard(async (req, res, p) => {
    const b = await parseBody(req);
    const out = W.lockBom(STORE, ENV, {
      actor: actorOf(req), projectId: p.id, at: at(b),
      acknowledgements: b.acknowledgements || [],
      upgrade: b.upgrade ?? null, futureUpgrade: !!b.futureUpgrade });
    persist();
    send(res, out.locked ? 200 : 409, out);
  }));

  addRoute('GET', '/api/workspace/projects/:id/snapshot', guard(async (req, res, p) =>
    send(res, 200, W.getSnapshot(STORE, { actor: actorOf(req), projectId: p.id }) || { snapshot: null })));

  // ---- cost / pricing ----------------------------------------------------
  addRoute('PUT', '/api/workspace/projects/:id/cost-inputs', guard(async (req, res, p) => {
    const b = await parseBody(req);
    const out = W.setCostInputs(STORE, { actor: actorOf(req), projectId: p.id, at: at(b), inputs: b.inputs || {} });
    persist();
    send(res, 200, out);
  }));

  addRoute('GET', '/api/workspace/projects/:id/cost', guard(async (req, res, p, q) =>
    send(res, 200, W.costPanel(STORE, ENV, { actor: actorOf(req), projectId: p.id, at: q.get('at') }))));

  addRoute('PUT', '/api/workspace/projects/:id/discount', guard(async (req, res, p) => {
    const b = await parseBody(req);
    const out = W.setDiscount(STORE, { actor: actorOf(req), projectId: p.id, at: at(b), discount: b.discount ?? null });
    persist();
    send(res, 200, out);
  }));

  addRoute('GET', '/api/workspace/projects/:id/pricing', guard(async (req, res, p, q) =>
    send(res, 200, W.pricingPanel(STORE, ENV, { actor: actorOf(req), projectId: p.id, at: q.get('at') }))));

  // ---- commercial history (PART E) ---------------------------------------
  addRoute('GET', '/api/workspace/commercial/types', guard(async (req, res) =>
    send(res, 200, { types: W.configTypes({ actor: actorOf(req) }) })));

  addRoute('GET', '/api/workspace/commercial/history', guard(async (req, res, p, q) =>
    send(res, 200, W.commercialHistoryPanel(ENV, {
      actor: actorOf(req), configType: q.get('configType'), recordId: q.get('recordId') }))));

  addRoute('GET', '/api/workspace/commercial/rate-card', guard(async (req, res) =>
    send(res, 200, W.rateCardPanel(ENV, { actor: actorOf(req) }))));

  // ---- PH-owned versioned rate card — write path (2026-09-07) ---------------
  // Conformance §16/§20/§24: production transport / installation / survey /
  // engineering-design rates must come from the PROJECT_HEAD-owned, versioned
  // rate card (projectRateCard.js), never from an unversioned literal in
  // cost-config. This route is the only way in: every rate lands as an
  // append-only version with who / when / why / effectiveFrom (appendVersion
  // refuses otherwise). Persisted to data/project-rate-card.json, which
  // buildEnv() already loads; the Cost Engine resolves it via fromCard() and
  // records the versionId on every head — so the commercial snapshot freezes
  // the exact rate version. RBAC: RATE_CARD_EDIT (PROJECT_HEAD).
  addRoute('PUT', '/api/workspace/commercial/rate-card', guard(async (req, res) => {
    const actor = actorOf(req);
    RBAC.assertCan(actor, RBAC.CAPABILITY.RATE_CARD_EDIT);
    const body = await parseBody(req);
    const changedAt = at(body);
    if (!changedAt) return send(res, 400, { error: 'Timestamp (at) is required.', code: 'MISSING_TIMESTAMP' });
    const rates = Array.isArray(body.rates) ? body.rates : null;
    if (!rates || !rates.length) return send(res, 400, { error: 'rates[] is required.', code: 'RATES_REQUIRED' });
    const RC = await import('./src/lib/projectRateCard.js');
    const validTypes = new Set(Object.values(RC.RATE_TYPE));
    let card = ENV.rateCard && ENV.rateCard.store
      ? Object.freeze({ cardVersion: ENV.rateCard.cardVersion ?? null, store: ENV.rateCard.store })
      : RC.createRateCard({ cardVersion: body.cardVersion ?? null });
    const applied = [];
    for (const [i, r] of rates.entries()) {
      if (!r || !validTypes.has(r.rateType))
        return send(res, 400, { error: `rates[${i}].rateType must be one of ${[...validTypes].join(', ')}`, code: 'RATE_TYPE_INVALID' });
      if (!r.recordId) return send(res, 400, { error: `rates[${i}].recordId is required.`, code: 'RECORD_ID_REQUIRED' });
      if (!r.value || typeof r.value !== 'object') return send(res, 400, { error: `rates[${i}].value object is required.`, code: 'VALUE_REQUIRED' });
      if (!r.changeReason) return send(res, 400, { error: `rates[${i}].changeReason is required.`, code: 'CHANGE_REASON_REQUIRED' });
      if (r.rateType === RC.RATE_TYPE.TRANSPORT_VEHICLE) {
        const rate = Number(r.value.ratePerKm);
        if (!Number.isFinite(rate) || rate <= 0)
          return send(res, 400, { error: `rates[${i}].value.ratePerKm must be a positive number.`, code: 'RATE_INVALID' });
        r.value = { vehicleType: r.recordId, ratePerKm: rate, unit: RC.RATE_UNIT.PER_KM, ...(r.value.vehicleName ? { vehicleName: r.value.vehicleName } : {}) };
      }
      if (r.rateType === RC.RATE_TYPE.INSTALLATION) {
        const rate = Number(r.value.rate);
        if (!Number.isFinite(rate) || rate < 0)
          return send(res, 400, { error: `rates[${i}].value.rate must be a non-negative number.`, code: 'RATE_INVALID' });
        if (r.value.unit !== RC.RATE_UNIT.PER_PROJECT && r.value.unit !== RC.RATE_UNIT.PER_KW)
          return send(res, 400, { error: `rates[${i}].value.unit must be PER_PROJECT or PER_KW.`, code: 'RATE_UNIT_INVALID' });
      }
      const effectiveFrom = r.effectiveFrom || changedAt;
      const versionId = r.versionId || `${r.recordId}@${effectiveFrom}`;
      card = RC.setRate(card, {
        rateType: r.rateType, recordId: r.recordId, value: r.value,
        versionId, changedBy: actor.userId, changedAt, changeReason: r.changeReason,
        effectiveFrom, effectiveTo: r.effectiveTo ?? null, cardVersion: body.cardVersion ?? card.cardVersion,
      });
      applied.push({ rateType: r.rateType, recordId: r.recordId, versionId });
    }
    fs.writeFileSync(dataPath('project-rate-card.json'), JSON.stringify(card, null, 2), 'utf-8');
    ENV = buildEnv();
    send(res, 200, { applied, rateCard: W.rateCardPanel(ENV, { actor }) });
  }));

  // ---- procurement (PART F) ----------------------------------------------
  // Registered here so server.js needs no change. Routes live under
  // /api/procurement/* and share nothing with the workspace routes above.
  procurement.register(addRoute, { send, parseBody, isAdmin, isAuthenticated: _isAuth, actorOf: _actorOf });

  // ---- CMS (C11-G) -------------------------------------------------------
  // Same pattern. Routes live under /api/cms/* and share no state with the
  // workspace or procurement routes.
  cms.register(addRoute, { send, parseBody, isAdmin, isAuthenticated: _isAuth, actorOf: _actorOf });

  // ---- quotation (PART H) ------------------------------------------------
  // Registered here for the same reason: server.js needs no change. Routes live
  // under /api/quotation/* and share no state with the routes above.
  quotation.register(addRoute, { send, parseBody, isAdmin, isAuthenticated: _isAuth, actorOf: _actorOf });
}

function rebuildEnv() { ENV = buildEnv(); }

module.exports = { init, register, getStore: () => STORE, getEnv: () => ENV, persist, rebuildEnv, getQuotationStore: () => quotation.getStore(), persistQuotation: () => quotation.persist(), getCmsStore: () => cms.getStore() };
