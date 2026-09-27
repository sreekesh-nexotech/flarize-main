// PACK CONFIG TRANSPORT — HTTP + file persistence for src/lib/packConfig.js.
//
// The Project Head edits the DRAFT (templates, structure tables, costs,
// installation matrix, transport, market rates, future-ready pairs), submits
// it, and Admin approves → the APPROVED configuration is what Sales and the
// orchestrator read. This module owns data/pack-config.json and exposes the
// two configs to the CommonJS side (server-bom-builder.js) synchronously.
//
// Transport only: validation, RBAC and state transitions live in the ESM lib.
// No clock here — `at` is caller-supplied (locked contract).

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'data', 'pack-config.json');
const CATALOG_FILE = path.join(__dirname, 'data', 'catalog.json');

let PC = null;            // ESM lib
let STORE = null;         // in-memory store (source of truth once loaded)
let _onApproved = null;   // hook: publish registry packs / rebuild env

function readJson(p, fallback) { try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return fallback; } }
function persist() { fs.writeFileSync(FILE, JSON.stringify(STORE, null, 2) + '\n', 'utf-8'); }

async function init({ onApproved = null, seedAt = null } = {}) {
  PC = await import('./src/lib/packConfig.js');
  _onApproved = onApproved;
  STORE = readJson(FILE, null);
  if (!STORE || STORE.schema !== PC.PACK_CONFIG_SCHEMA) {
    // First boot: the owner's catalog IS the configuration. Seeding is a
    // one-time migration recorded as version 1 (approvedBy SEED_FROM_CATALOG).
    const catalog = readJson(CATALOG_FILE, {});
    STORE = PC.seedFromCatalog(catalog, { at: seedAt || fs.statSync(CATALOG_FILE).mtime.toISOString() });
    persist();
  }
  return STORE;
}

/** Synchronous accessors for the CommonJS BOM builder. `source` = 'approved' | 'draft'. */
function getConfig(source = 'approved') {
  if (!STORE) { STORE = readJson(FILE, null); }
  if (!STORE) return null;
  return source === 'draft' ? STORE.draft?.config ?? null : STORE.approved?.config ?? null;
}
function getStore() { return STORE; }
function approvedVersion() { return STORE?.approved?.version ?? null; }

function register(addRoute, { send, parseBody, isAuthenticated, actorOf }) {
  const guard = (handler) => async (req, res, params, query) => {
    if (!isAuthenticated(req)) return send(res, 401, { error: 'Unauthorized' });
    if (!PC || !STORE) return send(res, 503, { error: 'Pack config not initialised yet', code: 'PACK_CONFIG_UNAVAILABLE' });
    try { await handler(req, res, params, query); }
    catch (err) {
      const code = err?.code || null;
      const status = err?.name === 'RbacError' ? 403
        : code === 'NOT_SUBMITTED' || code === 'ALREADY_SUBMITTED' || code === 'NO_CHANGES' ? 409
        : code ? 400 : 500;
      send(res, status, { error: err.message, code, detail: err.detail ?? null });
    }
  };
  const at = (b) => b?.at || null;
  const mustNotBeSales = (actor) => {
    if (!actor || ['SALES', 'SALES_HEAD', 'SALES_CRS', 'FIELD_SALES'].includes(actor.role)) {
      const e = new Error('Pack configuration (market rates, costs, templates) is not visible to Sales roles.'); e.name = 'RbacError'; e.code = 'CAPABILITY_DENIED'; throw e;
    }
  };

  // ---- read ---------------------------------------------------------------
  addRoute('GET', '/api/pack-config', guard(async (req, res) => {
    mustNotBeSales(actorOf(req));
    send(res, 200, PC.describeStore(STORE));
  }));
  addRoute('GET', '/api/pack-config/approved', guard(async (req, res) => {
    mustNotBeSales(actorOf(req));
    send(res, 200, { version: STORE.approved.version, approvedAt: STORE.approved.approvedAt, config: STORE.approved.config });
  }));
  addRoute('GET', '/api/pack-config/draft', guard(async (req, res) => {
    mustNotBeSales(actorOf(req));
    send(res, 200, { version: STORE.draft.version, status: STORE.draft.status, config: STORE.draft.config, changeLog: STORE.draft.changeLog });
  }));

  // ---- edit draft ---------------------------------------------------------
  addRoute('PUT', '/api/pack-config/draft/template/:systemType', guard(async (req, res, p) => {
    const b = await parseBody(req);
    STORE = PC.updateDraftTemplate(STORE, { actor: actorOf(req), systemType: p.systemType, template: b.template ?? b.value, at: at(b), note: b.note ?? null });
    persist(); send(res, 200, PC.describeStore(STORE));
  }));
  addRoute('PUT', '/api/pack-config/draft/:section', guard(async (req, res, p) => {
    const b = await parseBody(req);
    STORE = PC.updateDraftSection(STORE, { actor: actorOf(req), section: p.section, value: b.value, at: at(b), note: b.note ?? null });
    persist(); send(res, 200, PC.describeStore(STORE));
  }));

  // ---- lifecycle ----------------------------------------------------------
  addRoute('POST', '/api/pack-config/draft/submit', guard(async (req, res) => {
    const b = await parseBody(req);
    STORE = PC.submitDraft(STORE, { actor: actorOf(req), at: at(b) });
    persist(); send(res, 200, PC.describeStore(STORE));
  }));
  addRoute('POST', '/api/pack-config/draft/reject', guard(async (req, res) => {
    const b = await parseBody(req);
    STORE = PC.rejectDraft(STORE, { actor: actorOf(req), at: at(b), reason: b.reason ?? null });
    persist(); send(res, 200, PC.describeStore(STORE));
  }));
  addRoute('POST', '/api/pack-config/draft/reset', guard(async (req, res) => {
    const b = await parseBody(req);
    STORE = PC.resetDraft(STORE, { actor: actorOf(req), at: at(b) });
    persist(); send(res, 200, PC.describeStore(STORE));
  }));
  // Admin: re-publish the CURRENT approved configuration into the registry
  // (e.g. after catalog data that blocked a combo was completed).
  addRoute('POST', '/api/pack-config/publish', guard(async (req, res) => {
    const b = await parseBody(req);
    const actor = actorOf(req);
    const RBAC = await import('./src/lib/rbac.js');
    RBAC.assertCan(actor, RBAC.CAPABILITY.PACKAGE_APPROVE);
    if (!at(b)) return send(res, 400, { error: 'Timestamp (at) is required.', code: 'MISSING_TIMESTAMP' });
    const publish = _onApproved ? await _onApproved({ actor, at: at(b), version: STORE.approved.version }) : null;
    send(res, 200, { version: STORE.approved.version, publish });
  }));

  addRoute('POST', '/api/pack-config/draft/approve', guard(async (req, res) => {
    const b = await parseBody(req);
    const actor = actorOf(req);
    // { direct: true } — Admin approves its own DRAFT edits in one step
    // (recorded as submitted + approved by the Admin). Without it the normal
    // rule applies: only a Project-Head-SUBMITTED draft can be approved.
    STORE = b.direct === true && STORE.draft.status !== 'SUBMITTED'
      ? PC.approveDraftDirect(STORE, { actor, at: at(b), note: b.note ?? null })
      : PC.approveDraft(STORE, { actor, at: at(b), note: b.note ?? null });
    persist();
    let publish = null;
    if (_onApproved) publish = await _onApproved({ actor, at: at(b), version: STORE.approved.version });
    send(res, 200, { ...PC.describeStore(STORE), publish });
  }));
}

/**
 * Legacy Admin BOM-tool writes (PUT /api/admin/costs, market-rates, bom-template,
 * installation-matrix, transport-config, structure-templates) still edit
 * catalog.json for the old React tool. In pack mode the APPROVED pack config is
 * what Sales prices from, so the same change is mirrored into the pack-config
 * DRAFT — it becomes visible to Sales only after PH submit + Admin approve.
 * `patch(draftSectionValue) → newSectionValue`. Never throws; returns a note.
 */
function mirrorLegacyWrite({ actor, section, patch, at, note }) {
  if (!PC || !STORE) return { mirrored: false, reason: 'PACK_CONFIG_UNAVAILABLE' };
  try {
    const cur = JSON.parse(JSON.stringify(STORE.draft?.config?.[section] ?? {}));
    const next = patch(cur);
    STORE = PC.updateDraftSection(STORE, { actor, section, value: next, at: at || new Date().toISOString(), note: note || `legacy admin write mirrored: ${section}` });
    persist();
    return { mirrored: true, section, draftVersion: STORE.draft.version, draftStatus: STORE.draft.status, note: 'Mirrored into the pack-config DRAFT. Sales sees it after Project Head submit + Admin approve (/api/pack-config).' };
  } catch (e) {
    return { mirrored: false, section, reason: e.code || e.message };
  }
}

module.exports = { init, register, getConfig, getStore, approvedVersion, persist: () => persist(), mirrorLegacyWrite };
