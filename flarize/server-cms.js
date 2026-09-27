// CMS — HTTP TRANSPORT.  (C11-G)
//
// Transport only. Every rule lives in src/lib/cmsWorkspace.js, which in turn
// delegates to the CMS store, RBAC, field registry, page schema, and asset
// manager. Nothing here computes, validates, designs or defaults anything.
//
// AUTHENTICATION vs AUTHORISATION — unchanged and still explicit:
//   One credential, no user store. The session proves "an authorised operator
//   of this installation"; the acting ROLE is supplied per request. RBAC is
//   enforced at the service boundary (src/lib/rbac.js via cmsWorkspace),
//   never here.
//
// PERSISTENCE:
//   CMS state is a plain JSON object (not Maps). This file serialises it to
//   data/cms-state.json. Asset files live in data/cms-assets/.

const fs = require('fs');
const path = require('path');

// 2026-09-12 — overridable so the transport test runs against a temp store.
// Before this the test suite wrote its campaigns / pages / assets into the
// REAL data/cms-state.json + data/cms-assets on every `npm test` run and
// deactivated whatever offer campaign was live (the 315 "Updated Campaign"
// records found in the release data came from here).
const STATE_FILE = process.env.CMS_STATE_FILE || path.join(__dirname, 'data', 'cms-state.json');
const ASSETS_DIR = process.env.CMS_ASSETS_DIR || path.join(__dirname, 'data', 'cms-assets');

let CMS = null;               // ESM service layer, loaded once at startup
let RBAC = null;
let STORE = null;

function loadJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch (e) { return fallback; }
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function persist() {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(STORE, null, 2), 'utf-8'); }
  catch (e) { console.error('[cms] could not persist state:', e.message); }
}

async function init() {
  CMS = await import('./src/lib/cmsWorkspace.js');
  RBAC = await import('./src/lib/rbac.js');

  // Ensure assets directory exists
  ensureDir(ASSETS_DIR);

  // Load or create store
  const { createCmsStore } = await import('./src/lib/cmsStore.js');
  const saved = loadJson(STATE_FILE, null);
  STORE = saved || createCmsStore();

  return true;
}

// actorOf is injected from server-users.js (session-derived, not header-derived).
// Fallback to header-based resolution for backward-compat with existing transport tests.
let _actorOf;
function actorOf(req) {
  if (_actorOf) return _actorOf(req);
  // fallback: read from headers (test/legacy only — production always injects actorOf)
  const role = (req.headers || {})['x-actor-role'] || 'ADMIN';
  const userId = (req.headers || {})['x-actor-user'] || 'admin';
  return { userId, role };
}

/** Service error code -> HTTP status. Mapping only; no decision is made here. */
function statusFor(err) {
  if (err?.name === 'RbacError') return 403;
  switch (err?.code) {
    case 'NOT_FOUND':       return 404;
    case 'INVALID_STATUS':  return 409;
    case 'ASSET_IN_USE':    return 409;
    case 'VALIDATION_FAILED':
    case 'INVALID_INPUT':
      return 400;
    default:
      return err?.code ? 400 : 500;
  }
}

function register(addRoute, { send, parseBody, isAdmin, isAuthenticated: injectedIsAuthenticated, actorOf: injectedActorOf }) {
  if (injectedActorOf) _actorOf = injectedActorOf;
  const _isAuth = injectedIsAuthenticated || isAdmin;
  const guard = (handler) => async (req, res, params, query) => {
    if (!_isAuth(req)) return send(res, 401, { error: 'Unauthorized' });
    if (!CMS) return send(res, 503, { error: 'CMS layer not initialised yet' });
    try {
      await handler(req, res, params, query);
    } catch (err) {
      send(res, statusFor(err), {
        error: err.message,
        code: err?.code || null,
        detail: err?.detail ?? null,
      });
    }
  };

  // ---- pages ----------------------------------------------------------------

  addRoute('POST', '/api/cms/pages', guard(async (req, res) => {
    const b = await parseBody(req);
    const out = CMS.pageCreate(STORE, RBAC, actorOf(req), {
      name: b.name,
      pageType: b.pageType,
    });
    persist();
    send(res, 201, out);
  }));

  addRoute('GET', '/api/cms/pages', guard(async (req, res) => {
    const pages = CMS.pageList(STORE, RBAC, actorOf(req));
    send(res, 200, { pages });
  }));

  addRoute('GET', '/api/cms/pages/:pageId', guard(async (req, res, p) => {
    const out = CMS.pageGet(STORE, RBAC, actorOf(req), p.pageId);
    send(res, 200, out);
  }));

  addRoute('PUT', '/api/cms/pages/:pageId/draft', guard(async (req, res, p) => {
    const b = await parseBody(req);
    const out = CMS.draftUpdate(STORE, RBAC, actorOf(req), p.pageId, b.content || b);
    persist();
    send(res, 200, out);
  }));

  addRoute('POST', '/api/cms/pages/:pageId/preview', guard(async (req, res, p) => {
    const out = CMS.preview(STORE, RBAC, actorOf(req), p.pageId);
    send(res, 200, out);
  }));

  addRoute('POST', '/api/cms/pages/:pageId/submit-review', guard(async (req, res, p) => {
    const out = CMS.submitForReview(STORE, RBAC, actorOf(req), p.pageId);
    persist();
    send(res, 200, out);
  }));

  addRoute('POST', '/api/cms/pages/:pageId/approve', guard(async (req, res, p) => {
    const out = CMS.approve(STORE, RBAC, actorOf(req), p.pageId);
    persist();
    send(res, 200, out);
  }));

  addRoute('POST', '/api/cms/pages/:pageId/publish', guard(async (req, res, p) => {
    const out = CMS.publish(STORE, RBAC, actorOf(req), p.pageId);
    persist();
    send(res, 200, out);
  }));

  addRoute('POST', '/api/cms/pages/:pageId/archive', guard(async (req, res, p) => {
    const out = CMS.archive(STORE, RBAC, actorOf(req), p.pageId);
    persist();
    send(res, 200, out);
  }));

  addRoute('GET', '/api/cms/pages/:pageId/versions', guard(async (req, res, p) => {
    const versions = CMS.versionHistory(STORE, RBAC, actorOf(req), p.pageId);
    send(res, 200, { versions });
  }));

  // ---- assets ---------------------------------------------------------------

  addRoute('POST', '/api/cms/assets', guard(async (req, res) => {
    const b = await parseBody(req);
    const out = CMS.assetUpload(STORE, RBAC, actorOf(req), b, ASSETS_DIR);
    persist();
    send(res, 201, out);
  }));

  addRoute('GET', '/api/cms/assets', guard(async (req, res) => {
    const assets = CMS.assetList(STORE, RBAC, actorOf(req));
    send(res, 200, { assets });
  }));

  addRoute('GET', '/api/cms/assets/:assetId', guard(async (req, res, p) => {
    const out = CMS.assetGet(STORE, RBAC, actorOf(req), p.assetId);
    send(res, 200, out);
  }));

  // Asset FILES are public-read (2026-09-10): the customer document and the
  // server PDF renderer load them with plain <img src> (no Authorization
  // header). Assets are brand images / QR codes / photos — never commercial
  // data. Metadata, upload and archive stay authenticated.
  addRoute('GET', '/api/cms/assets/:assetId/file', async (req, res, p) => {
    if (!CMS) return send(res, 503, { error: 'CMS layer not initialised yet' });
    let file;
    try { file = CMS.assetFile(STORE, RBAC, { userId: 'public', role: 'ADMIN' }, p.assetId, ASSETS_DIR); }
    catch (err) { return send(res, statusFor(err), { error: err.message, code: err?.code || null, detail: null }); }
    // Send binary file, not JSON
    res.writeHead(200, {
      'Content-Type': file.mimeType,
      'Content-Disposition': `inline; filename="${file.filename}"`,
      'Cache-Control': 'public, max-age=86400',
    });
    res.end(file.buffer);
  });

  addRoute('POST', '/api/cms/assets/:assetId/archive', guard(async (req, res, p) => {
    const out = CMS.assetArchive(STORE, RBAC, actorOf(req), p.assetId);
    persist();
    send(res, 200, out);
  }));

  // ---- campaigns ------------------------------------------------------------

  addRoute('POST', '/api/cms/campaigns', guard(async (req, res) => {
    const b = await parseBody(req);
    const out = CMS.campaignCreate(STORE, RBAC, actorOf(req), { name: b.name });
    persist();
    send(res, 201, out);
  }));

  addRoute('GET', '/api/cms/campaigns', guard(async (req, res) => {
    const campaigns = CMS.campaignList(STORE, RBAC, actorOf(req));
    send(res, 200, { campaigns });
  }));

  addRoute('GET', '/api/cms/campaigns/:campaignId', guard(async (req, res, p) => {
    const out = CMS.campaignGet(STORE, RBAC, actorOf(req), p.campaignId);
    send(res, 200, out);
  }));

  addRoute('PUT', '/api/cms/campaigns/:campaignId', guard(async (req, res, p) => {
    const b = await parseBody(req);
    const out = CMS.campaignUpdate(STORE, RBAC, actorOf(req), p.campaignId, b);
    persist();
    send(res, 200, out);
  }));

  addRoute('POST', '/api/cms/campaigns/:campaignId/activate', guard(async (req, res, p) => {
    const out = CMS.campaignActivate(STORE, RBAC, actorOf(req), p.campaignId);
    persist();
    send(res, 200, out);
  }));

  addRoute('POST', '/api/cms/campaigns/:campaignId/deactivate', guard(async (req, res, p) => {
    const out = CMS.campaignDeactivate(STORE, RBAC, actorOf(req), p.campaignId);
    persist();
    send(res, 200, out);
  }));

  // ---- fields ---------------------------------------------------------------

  addRoute('GET', '/api/cms/fields', guard(async (req, res) => {
    const fields = CMS.fieldList(RBAC, actorOf(req));
    send(res, 200, { fields });
  }));

  // ---- templates (placeholder for future) -----------------------------------

  addRoute('GET', '/api/cms/templates', guard(async (req, res) => {
    // Template library — placeholder returning empty for now.
    send(res, 200, { templates: [] });
  }));
}

/** Expose the CMS store for quotation integration (C11-H). */
function getStore() { return STORE; }

module.exports = { init, register, getStore };
