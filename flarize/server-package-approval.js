// PACKAGE APPROVAL — HTTP TRANSPORT.  (Master Plan — Step 2; extended by Phase 3 V4)
//
// Registers /api/packages/* routes for both the legacy approval flow and
// the V4 authoring/lifecycle flow. PROJECT_HEAD authors and submits;
// ADMIN approves/rejects/archives; ENGINEERING and ADMIN can compare.
// Sales sees only the runtime-visible slice (visibleForRuntime).
//
// The package registry file (data/packages.proposed.json) is the single
// authority. This transport reads and mutates it, then persists.

const fs = require('fs');
const path = require('path');

const REGISTRY_FILE = path.join(__dirname, 'data', 'packages.proposed.json');

let PA = null;      // ESM service layer — packageApproval
let RBAC = null;
let PROJ = null;    // packageProjection
let PAUTH = null;   // packageAuthoring

function loadJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return fallback; }
}

function loadRegistry() {
  const raw = loadJson(REGISTRY_FILE, { packages: [] });
  return PROJ ? PROJ.hydrateRegistry(raw) : raw;
}

function persistRegistry(registry) {
  try {
    fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2), 'utf-8');
  } catch (e) {
    console.error('[package-approval] could not persist registry:', e.message);
  }
}

async function init() {
  PA = await import('./src/lib/packageApproval.js');
  RBAC = await import('./src/lib/rbac.js');
  PROJ = await import('./src/lib/packageProjection.js');
  PAUTH = await import('./src/lib/packageAuthoring.js');
  return true;
}

// actorOf is injected from server-users.js
let _actorOf;
function actorOf(req) {
  if (_actorOf) return _actorOf(req);
  const role = (req.headers || {})['x-actor-role'] || null;
  const userId = (req.headers || {})['x-actor-user'] || null;
  if (!role && !userId) return null;
  return { userId, role };
}

let _onPackageChange = null;

/** Rebuilds env from the workspace module without creating an init-time
 *  cycle. Only called from routes that need the checker (which needs
 *  env.catalog + env.batteryMaster). */
function getEnvFromWorkspace() {
  try {
    const workspace = require('./server-workspace.js');
    return workspace.getEnv && workspace.getEnv();
  } catch {
    return null;
  }
}

function register(addRoute, { send, parseBody, isAdmin, isAuthenticated: injectedIsAuthenticated, actorOf: injectedActorOf, onPackageChange }) {
  if (injectedActorOf) _actorOf = injectedActorOf;
  if (onPackageChange) _onPackageChange = onPackageChange;
  const _isAuth = injectedIsAuthenticated || isAdmin;
  const guard = (handler) => async (req, res, params, query) => {
    if (!_isAuth(req)) return send(res, 401, { error: 'Unauthorized' });
    if (!PA) return send(res, 503, { error: 'Package approval layer not initialised yet' });
    try {
      await handler(req, res, params, query);
    } catch (err) {
      const code = err?.code || null;
      const status = err?.name === 'RbacError' ? 403
        : (err?.name === 'ApprovalError' || err?.name === 'AuthoringError') && code === 'PACKAGE_NOT_FOUND' ? 404
        : (err?.name === 'ApprovalError' || err?.name === 'AuthoringError') ? 400
        : code ? 400 : 500;
      send(res, status, { error: err.message, code, detail: err.detail ?? null });
    }
  };

  // ---- List packages (role-filtered) ----------------------------------------
  addRoute('GET', '/api/packages', guard(async (req, res, params, query) => {
    const registry = loadRegistry();
    const filter = {};
    if (query?.get?.('systemType')) filter.systemType = query.get('systemType');
    if (query?.get?.('tier')) filter.tier = query.get('tier');
    if (query?.get?.('phase')) filter.phase = query.get('phase');
    if (query?.get?.('size')) filter.size = query.get('size');
    if (query?.get?.('approvalStatus')) filter.approvalStatus = query.get('approvalStatus');
    if (query?.get?.('packageState')) filter.packageState = query.get('packageState');

    const actor = actorOf(req);
    let packages = PA.listPackagesForRole(registry, { actor, filter });

    // Sales visibility — enforce the runtime-visible slice at transport as
    // well as at the env layer, so a direct GET /api/packages hides
    // superseded/archived/draft records from any Sales role.
    const isSales = RBAC.isIndividualSalesRole(actor?.role) || actor?.role === 'SALES_HEAD';
    if (isSales && PROJ) {
      const filtered = PROJ.visibleForRuntime({ packages });
      packages = filtered.packages;
    }

    // Additive variant filter — post-processed at transport, engine untouched.
    // Absent variant param preserves existing behaviour byte-for-byte.
    // variant=STANDARD (default when omitted? no — omitted keeps every variant
    // for backwards compatibility), variant=FUTURE_READY, or variant=ALL.
    const variant = query?.get?.('variant');
    if (variant && variant !== 'ALL') packages = packages.filter(p => (p.variant || 'STANDARD') === variant);
    const systemSize = query?.get?.('systemSize');
    if (systemSize) packages = packages.filter(p => String(p.systemSize ?? p.size) === String(systemSize));

    send(res, 200, { packages, total: packages.length });
  }));

  // ---- Approval summary (dashboard) -----------------------------------------
  addRoute('GET', '/api/packages/approval-summary', guard(async (req, res) => {
    const registry = loadRegistry();
    send(res, 200, PA.approvalSummary(registry));
  }));

  // ---- Compare (2..5 packages) ---------------------------------------------
  addRoute('GET', '/api/packages/compare', guard(async (req, res, params, query) => {
    const idsCsv = query?.get?.('ids') || '';
    const packageIds = idsCsv.split(',').map(s => s.trim()).filter(Boolean);
    const registry = loadRegistry();
    const result = PAUTH.comparePackages(registry, { actor: actorOf(req), packageIds });
    send(res, 200, result);
  }));

  // ---- Approve a package ----------------------------------------------------
  addRoute('POST', '/api/packages/:id/approve', guard(async (req, res, params) => {
    const registry = loadRegistry();
    const body = await parseBody(req);
    const result = PA.approvePackage(registry, {
      actor: actorOf(req),
      packageId: params.id,
      notes: body.notes || null,
      at: body.at || new Date().toISOString(),
    });
    persistRegistry(registry);
    if (_onPackageChange) _onPackageChange();
    send(res, 200, result);
  }));

  // ---- Reject a package -----------------------------------------------------
  addRoute('POST', '/api/packages/:id/reject', guard(async (req, res, params) => {
    const registry = loadRegistry();
    const body = await parseBody(req);
    const result = PA.rejectPackage(registry, {
      actor: actorOf(req),
      packageId: params.id,
      reason: body.reason || null,
      at: body.at || new Date().toISOString(),
    });
    persistRegistry(registry);
    if (_onPackageChange) _onPackageChange();
    send(res, 200, result);
  }));

  // ---- Reset a package to PROPOSED/DRAFT ------------------------------------
  addRoute('POST', '/api/packages/:id/reset', guard(async (req, res, params) => {
    const registry = loadRegistry();
    const body = await parseBody(req);
    const result = PA.resetPackage(registry, {
      actor: actorOf(req),
      packageId: params.id,
      at: body.at || new Date().toISOString(),
    });
    persistRegistry(registry);
    if (_onPackageChange) _onPackageChange();
    send(res, 200, result);
  }));

  // ---- Bulk approve packages ------------------------------------------------
  addRoute('POST', '/api/packages/bulk-approve', guard(async (req, res) => {
    const registry = loadRegistry();
    const body = await parseBody(req);
    const result = PA.bulkApprovePackages(registry, {
      actor: actorOf(req),
      filter: body.filter || {},
      notes: body.notes || null,
      at: body.at || new Date().toISOString(),
    });
    persistRegistry(registry);
    if (_onPackageChange) _onPackageChange();
    send(res, 200, result);
  }));

  // ---- V4: Create a new package (DRAFT) ------------------------------------
  addRoute('POST', '/api/packages', guard(async (req, res) => {
    const registry = loadRegistry();
    const body = await parseBody(req);
    const at = body.at || new Date().toISOString();
    const result = PA.createPackage(registry, {
      actor: actorOf(req),
      template: body.template || {},
      at,
    });
    persistRegistry(registry);
    if (_onPackageChange) _onPackageChange();
    send(res, 201, result);
  }));

  // ---- V4: Duplicate a package ----------------------------------------------
  addRoute('POST', '/api/packages/:id/duplicate', guard(async (req, res, params) => {
    const registry = loadRegistry();
    const body = await parseBody(req);
    const at = body.at || new Date().toISOString();
    const result = PA.duplicatePackage(registry, {
      actor: actorOf(req),
      sourcePackageId: params.id,
      at,
    });
    persistRegistry(registry);
    if (_onPackageChange) _onPackageChange();
    send(res, 201, result);
  }));

  // ---- V4: Create a revision of an APPROVED package -----------------------
  addRoute('POST', '/api/packages/:id/revision', guard(async (req, res, params) => {
    const registry = loadRegistry();
    const body = await parseBody(req);
    const at = body.at || new Date().toISOString();
    const result = PA.createRevision(registry, {
      actor: actorOf(req),
      sourcePackageId: params.id,
      at,
    });
    persistRegistry(registry);
    if (_onPackageChange) _onPackageChange();
    send(res, 201, result);
  }));

  // ---- V4: Edit a DRAFT package --------------------------------------------
  addRoute('PATCH', '/api/packages/:id', guard(async (req, res, params) => {
    const registry = loadRegistry();
    const body = await parseBody(req);
    const at = body.at || new Date().toISOString();
    const result = PA.editPackage(registry, {
      actor: actorOf(req),
      packageId: params.id,
      patch: body.patch || {},
      at,
    });
    persistRegistry(registry);
    if (_onPackageChange) _onPackageChange();
    send(res, 200, result);
  }));

  // ---- V4: Submit DRAFT -> SUBMITTED --------------------------------------
  addRoute('POST', '/api/packages/:id/submit', guard(async (req, res, params) => {
    const registry = loadRegistry();
    const body = await parseBody(req);
    const at = body.at || new Date().toISOString();
    const result = PA.submitPackage(registry, {
      actor: actorOf(req),
      packageId: params.id,
      at,
    });
    persistRegistry(registry);
    if (_onPackageChange) _onPackageChange();
    send(res, 200, result);
  }));

  // ---- V4: Archive a package -----------------------------------------------
  addRoute('POST', '/api/packages/:id/archive', guard(async (req, res, params) => {
    const registry = loadRegistry();
    const body = await parseBody(req);
    const at = body.at || new Date().toISOString();
    const result = PA.archivePackage(registry, {
      actor: actorOf(req),
      packageId: params.id,
      reason: body.reason || null,
      at,
    });
    persistRegistry(registry);
    if (_onPackageChange) _onPackageChange();
    send(res, 200, result);
  }));

  // ---- V4: Run engineering checker on a package ---------------------------
  addRoute('POST', '/api/packages/:id/run-checker', guard(async (req, res, params) => {
    const registry = loadRegistry();
    const body = await parseBody(req);
    const at = body.at || new Date().toISOString();
    const env = getEnvFromWorkspace();
    if (!env) return send(res, 503, { error: 'Environment not initialised', code: 'ENV_UNAVAILABLE' });
    const result = PA.runPackageChecker(registry, env, {
      actor: actorOf(req),
      packageId: params.id,
      at,
    });
    persistRegistry(registry);
    if (_onPackageChange) _onPackageChange();
    send(res, 200, result);
  }));

  // ---- Package detail (full component list) ---------------------------------
  addRoute('GET', '/api/packages/:id', guard(async (req, res, params) => {
    const registry = loadRegistry();
    const pkg = (registry.packages || []).find(p => p.packageId === params.id);
    if (!pkg) return send(res, 404, { error: 'Package not found', code: 'PACKAGE_NOT_FOUND' });

    // Sales can only see APPROVED, non-superseded, non-archived package details
    const actor = actorOf(req);
    const isSales = RBAC.isIndividualSalesRole(actor?.role) || actor?.role === 'SALES_HEAD';
    if (isSales) {
      const runtimeVisible = pkg.packageState === 'APPROVED' && !pkg.supersededBy && pkg.packageState !== 'ARCHIVED';
      if (!runtimeVisible) {
        return send(res, 403, { error: 'Package is not approved for Sales access', code: 'NOT_APPROVED_FOR_SALES' });
      }
    }

    send(res, 200, pkg);
  }));
}

module.exports = { init, register };
