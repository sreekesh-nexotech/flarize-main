// PROCUREMENT WORKSPACE — HTTP TRANSPORT.  (Phase 3, PART F)
//
// Transport only. Every rule lives in src/lib/procurementWorkspace.js, which in
// turn delegates to the frozen engines (procurementBatch, procurementPriceMaster,
// commercialHistory, rbac, money). Nothing here computes, allocates, validates
// or defaults anything.
//
// AUTHENTICATION vs AUTHORISATION — unchanged and still explicit:
//   One credential, no user store. The session proves "an authorised operator of
//   this installation"; the acting ROLE is supplied per request. RBAC is enforced
//   at the service boundary (src/lib/rbac.js + procurementWorkspace RBAC helpers),
//   but the role is operator-asserted, not identity-proven. P3-D is NOT solved
//   here and the limitation is reported by GET /api/procurement/session.
//
// INTEGRATION WITH THE COST ENGINE:
//   A committed batch writes data/procurement-price-master.json (the projection
//   the Cost Engine consumes) and data/commercial-history.json (the one history
//   store), then asks the workspace layer to rebuild its environment. The Cost
//   Engine itself is untouched — it already reads a price master.

const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, 'data', 'procurement-state.json');
const HISTORY_FILE = path.join(__dirname, 'data', 'commercial-history.json');
const PRICE_MASTER_FILE = path.join(__dirname, 'data', 'procurement-price-master.json');

let P = null;                 // ESM service layer, loaded once at startup
let RBAC = null;
let ENV = null;
let STORE = null;
let ON_COMMIT = null;         // supplied by the workspace layer; rebuilds its ENV

function loadJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch (e) { return fallback; }
}

function dataPath(name) { return path.join(__dirname, 'data', name); }

/** Catalog only — procurement needs component identity, nothing else. */
function buildEnv() {
  return { catalog: loadJson(dataPath('catalog.json'), { categories: {} }) };
}

function writeJson(file, value) {
  try { fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf-8'); }
  catch (e) { console.error('[procurement] could not write', path.basename(file) + ':', e.message); }
}

function persist() {
  writeJson(STATE_FILE, STORE);
  // The single history store on disk. Loaded back on startup, never replaced by
  // a second mechanism.
  writeJson(HISTORY_FILE, STORE.historyStore);
  // The Cost Engine's price master — a projection of the history store.
  writeJson(PRICE_MASTER_FILE, P.priceMasterView(STORE));
}

async function init(hooks = {}) {
  P = await import('./src/lib/procurementWorkspace.js');
  RBAC = await import('./src/lib/rbac.js');
  ENV = buildEnv();
  ON_COMMIT = hooks.onCommit || null;

  const saved = loadJson(STATE_FILE, null);
  if (saved && saved.historyStore) {
    STORE = saved;
    if (!STORE.suppliers) STORE.suppliers = {};
    if (!STORE.batches) STORE.batches = {};
    if (!STORE.audit) STORE.audit = [];
  } else {
    // Adopt an existing commercial history file if one is already on disk, so
    // procurement appends to it rather than starting a second timeline.
    STORE = P.createProcurementStore(loadJson(HISTORY_FILE, null));
  }
  return true;
}

// actorOf is injected from server-users.js (session-derived, not header-derived).
let _actorOf;
function actorOf(req) {
  if (_actorOf) return _actorOf(req);
  const role = (req.headers || {})['x-actor-role'] || 'ADMIN';
  const userId = (req.headers || {})['x-actor-user'] || 'admin';
  return { userId, role };
}

function register(addRoute, { send, parseBody, isAdmin, isAuthenticated: injectedIsAuthenticated, actorOf: injectedActorOf }) {
  if (injectedActorOf) _actorOf = injectedActorOf;
  const _isAuth = injectedIsAuthenticated || isAdmin;
  const guard = (handler) => async (req, res, params, query) => {
    if (!_isAuth(req)) return send(res, 401, { error: 'Unauthorized' });
    if (!P) return send(res, 503, { error: 'Procurement layer not initialised yet' });
    try {
      await handler(req, res, params, query);
    } catch (err) {
      const code = err?.code || null;
      const status = err?.name === 'RbacError' ? 403
        : code === 'SUPPLIER_NOT_FOUND' || code === 'BATCH_NOT_FOUND' ? 404
        : code ? 400 : 500;
      send(res, status, { error: err.message, code, detail: err.detail ?? null });
    }
  };

  const at = (b) => b.at || null;    // caller-supplied; the service refuses null

  // ---- session -----------------------------------------------------------
  addRoute('GET', '/api/procurement/session', guard(async (req, res) => {
    const actor = actorOf(req);
    send(res, 200, {
      ...P.session({ actor }),
      actor,
      roles: RBAC.ALL_ROLES,
      rbacVersion: RBAC.RBAC_VERSION,
      identityModel: 'AUTHENTICATED_USER',
      identityNote: 'Per-user identity is active (server-users.js). The actor { userId, role } is ' +
        'derived from the authenticated session server-side; client-supplied x-actor-* headers are ' +
        'ignored. RBAC is enforced at the service boundary against the session-derived role.',
    });
  }));

  addRoute('POST', '/api/procurement/reload', guard(async (req, res) => {
    ENV = buildEnv();
    send(res, 200, { ok: true });
  }));

  // ---- A · dashboard -----------------------------------------------------
  addRoute('GET', '/api/procurement/dashboard', guard(async (req, res) =>
    send(res, 200, P.dashboard(STORE, ENV, { actor: actorOf(req) }))));

  addRoute('GET', '/api/procurement/materials', guard(async (req, res) =>
    send(res, 200, { materials: P.listMaterials(ENV, { actor: actorOf(req) }) })));

  addRoute('GET', '/api/procurement/price-master', guard(async (req, res, p, q) => {
    P.assertProcurementRead(actorOf(req));
    send(res, 200, {
      asOf: q.get('asOf') || null,
      priceMaster: P.priceMasterView(STORE, { asOf: q.get('asOf') || null }),
      ...P.landedCostVersionSummary(STORE),
    });
  }));

  // ---- 1 · suppliers -----------------------------------------------------
  addRoute('GET', '/api/procurement/suppliers', guard(async (req, res) =>
    send(res, 200, { suppliers: P.listSuppliers(STORE, { actor: actorOf(req) }) })));

  addRoute('POST', '/api/procurement/suppliers', guard(async (req, res) => {
    const b = await parseBody(req);
    const out = P.createSupplier(STORE, { actor: actorOf(req), supplierId: b.supplierId,
      name: b.name ?? null, reference: b.reference ?? null, at: at(b) });
    persist();
    send(res, 201, out);
  }));

  // ---- B · purchase batch ------------------------------------------------
  addRoute('GET', '/api/procurement/batches', guard(async (req, res) =>
    send(res, 200, { batches: P.listBatches(STORE, { actor: actorOf(req) }) })));

  addRoute('POST', '/api/procurement/batches', guard(async (req, res) => {
    const b = await parseBody(req);
    const out = P.createBatch(STORE, { actor: actorOf(req), ...b, at: at(b) });
    persist();
    send(res, 201, out);
  }));

  addRoute('GET', '/api/procurement/batches/:id', guard(async (req, res, p) =>
    send(res, 200, P.batchView(STORE, { actor: actorOf(req), batchId: p.id }))));

  addRoute('PUT', '/api/procurement/batches/:id/lines', guard(async (req, res, p) => {
    const b = await parseBody(req);
    const out = P.setBatchLines(STORE, ENV, { actor: actorOf(req), batchId: p.id, lines: b.lines || [], at: at(b) });
    persist();
    send(res, 200, out);
  }));

  addRoute('PUT', '/api/procurement/batches/:id/charges', guard(async (req, res, p) => {
    const b = await parseBody(req);
    const out = P.setBatchCharges(STORE, { actor: actorOf(req), batchId: p.id, ...b, at: at(b) });
    persist();
    send(res, 200, out);
  }));

  // ---- C · allocation review ---------------------------------------------
  addRoute('GET', '/api/procurement/batches/:id/allocation', guard(async (req, res, p) =>
    send(res, 200, P.allocationPreview(STORE, ENV, { actor: actorOf(req), batchId: p.id }))));

  addRoute('POST', '/api/procurement/batches/:id/commit', guard(async (req, res, p) => {
    const b = await parseBody(req);
    const out = P.commitBatch(STORE, ENV, { actor: actorOf(req), batchId: p.id, at: at(b),
      effectiveFrom: b.effectiveFrom ?? null, changeReason: b.changeReason ?? null });
    persist();

    // Update cost-config procurement status now that prices are committed
    try {
      const ccPath = path.join(__dirname, 'data', 'cost-config.json');
      const cc = loadJson(ccPath, {});
      if (cc.procurement) {
        const summary = P.landedCostVersionSummary(STORE);
        cc.procurement.status = 'CONFIGURED';
        cc.procurement.purchasePriceVersion = out.batchId || p.id;
        cc.procurement.landedCostVersion = out.batchId || p.id;
        fs.writeFileSync(ccPath, JSON.stringify(cc, null, 2), 'utf-8');
      }
    } catch (e) { console.error('[procurement] cost-config update:', e.message); }

    // The Cost Engine integration point: the workspace environment is rebuilt
    // so the new landed-cost version is visible to cost calculations.
    if (ON_COMMIT) { try { ON_COMMIT(); } catch (e) { console.error('[procurement] cost-engine refresh failed:', e.message); } }
    send(res, 200, out);
  }));

  // ---- D · material / landed cost detail ---------------------------------
  addRoute('GET', '/api/procurement/materials/:componentId', guard(async (req, res, p, q) =>
    send(res, 200, P.materialDetail(STORE, ENV, {
      actor: actorOf(req), componentId: p.componentId, asOf: q.get('asOf') || null }))));

  // ---- E · price history / compare ---------------------------------------
  addRoute('GET', '/api/procurement/materials/:componentId/history', guard(async (req, res, p) =>
    send(res, 200, P.priceHistoryPanel(STORE, { actor: actorOf(req), componentId: p.componentId }))));

  addRoute('GET', '/api/procurement/materials/:componentId/compare', guard(async (req, res, p, q) =>
    send(res, 200, P.compareVersionsPanel(STORE, {
      actor: actorOf(req), componentId: p.componentId,
      fromVersionId: q.get('from') || null, toVersionId: q.get('to') || null }))));
}

module.exports = { init, register };
