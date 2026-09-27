// QUOTATION CONTENT — HTTP TRANSPORT (P1, 2026-09-13)
//
// Transport only. Rules (schema, fit guard, lifecycle) live in
// src/lib/quotationContent.js. Store: data/quotation-content.json.
//
// Routes (all require an authenticated session):
//   GET  /api/quotation-content            → { published: {...}, draft: {...}, status, limits, dailyGenPerKw }
//   GET  /api/quotation-content/published  → published content only (any role — the renderer needs it)
//   PUT  /api/quotation-content/draft      → save draft (ADMIN | PROJECT_HEAD); 422 + errors when it does not fit
//   POST /api/quotation-content/publish    → publish draft (ADMIN | PROJECT_HEAD)
//   POST /api/quotation-content/discard    → reset draft to published (ADMIN | PROJECT_HEAD)
//   POST /api/quotation-content/validate   → dry-run fit check for the editor (ADMIN | PROJECT_HEAD)
//   GET  /api/quotation-content/appliances/defaults?kw=5 → default rows + generation for Sales step 2 (any role)

const fs = require('fs');
const path = require('path');

const STORE_FILE = process.env.QUOTATION_CONTENT_FILE || path.join(__dirname, 'data', 'quotation-content.json');
const ENERGY_FILE = path.join(__dirname, 'data', 'energy-config.json');
const EDIT_ROLES = ['ADMIN', 'PROJECT_HEAD'];

let QC = null;      // ESM lib
let STORE = null;

function loadJson(p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return fb; } }
function persist() {
  try { fs.writeFileSync(STORE_FILE, JSON.stringify(STORE, null, 2) + '\n', 'utf-8'); }
  catch (e) { console.error('[quotation-content] could not persist:', e.message); }
}
function dailyGenPerKw() {
  const cfg = loadJson(ENERGY_FILE, null);
  const v = Number(cfg?.regions?.kerala?.yield?.dailyGenPerKw);
  return v > 0 ? v : (QC ? QC.FALLBACK_DAILY_GEN_PER_KW : 4);
}

async function init() {
  QC = await import('./src/lib/quotationContent.js');
  STORE = loadJson(STORE_FILE, null);
  if (!STORE || !STORE.published || !STORE.draft) {
    console.warn('[quotation-content] store missing or malformed — pages 3/9/10/11 will render with no editable content until data/quotation-content.json is restored (scripts/build-quotation-content-seed.py).');
    STORE = STORE && STORE.published ? STORE : { storeVersion: 'quotationContent.1', published: { version: 0, content: null }, draft: { version: 1, content: null } };
  }
  return true;
}

/** Published content for the renderer / orchestrator (frozen copy). */
function getPublishedContent() { return STORE?.published?.content ? JSON.parse(JSON.stringify(STORE.published.content)) : null; }
function getPublishedVersion() { return STORE?.published?.version ?? 0; }

let _actorOf = null;
function register(addRoute, { send, parseBody, isAuthenticated, actorOf }) {
  _actorOf = actorOf;
  const guard = (fn) => async (req, res, params, query) => {
    if (!isAuthenticated(req)) return send(res, 401, { error: 'Unauthorized' });
    try { return await fn(req, res, params, query); }
    catch (e) {
      if (e.code === 'CONTENT_INVALID') return send(res, 422, { error: e.message, code: e.code, errors: e.errors });
      return send(res, 500, { error: e.message });
    }
  };
  const editGuard = (fn) => guard(async (req, res, params, query) => {
    const actor = actorOf(req);
    if (!EDIT_ROLES.includes(actor?.role)) return send(res, 403, { error: 'Only Admin or Project Head edits quotation content', code: 'ROLE_DENIED' });
    return fn(req, res, params, query, actor);
  });

  addRoute('GET', '/api/quotation-content', guard(async (req, res) => {
    send(res, 200, { status: QC.describeStore(STORE), published: STORE.published, draft: STORE.draft, limits: QC.LIMITS, dailyGenPerKw: dailyGenPerKw() });
  }));

  addRoute('GET', '/api/quotation-content/published', guard(async (req, res) => {
    send(res, 200, { version: getPublishedVersion(), content: getPublishedContent() });
  }));

  addRoute('PUT', '/api/quotation-content/draft', editGuard(async (req, res, p, q, actor) => {
    const body = await parseBody(req);
    const content = body && body.content ? body.content : body;
    QC.saveDraft(STORE, content, actor, new Date().toISOString(), { dailyGenPerKw: dailyGenPerKw() });
    persist();
    send(res, 200, { ok: true, ...QC.describeStore(STORE) });
  }));

  addRoute('POST', '/api/quotation-content/validate', editGuard(async (req, res) => {
    const body = await parseBody(req);
    const content = body && body.content ? body.content : body;
    send(res, 200, QC.fitSummary(content, { dailyGenPerKw: dailyGenPerKw() }));
  }));

  addRoute('POST', '/api/quotation-content/publish', editGuard(async (req, res, p, q, actor) => {
    QC.publishDraft(STORE, actor, new Date().toISOString(), { dailyGenPerKw: dailyGenPerKw() });
    persist();
    send(res, 200, { ok: true, ...QC.describeStore(STORE) });
  }));

  addRoute('POST', '/api/quotation-content/discard', editGuard(async (req, res) => {
    QC.discardDraft(STORE);
    persist();
    send(res, 200, { ok: true, ...QC.describeStore(STORE) });
  }));

  // Sales step 2 — default appliance rows for the recommended size.
  addRoute('GET', '/api/quotation-content/appliances/defaults', guard(async (req, res, p, query) => {
    const qget = (k) => (query && typeof query.get === 'function') ? query.get(k) : query?.[k];
    const kw = Number(qget('kw'));
    const content = getPublishedContent();
    if (!content) return send(res, 404, { error: 'No published quotation content', code: 'CONTENT_MISSING' });
    if (!(kw > 0)) return send(res, 400, { error: 'kw is required', code: 'BAD_REQUEST' });
    const gen = dailyGenPerKw();
    const { profileKey, rows } = QC.defaultRowsForKw(content, kw);
    const lang = QC.normaliseLanguage(qget('lang'));
    const master = (content.appliances?.master || []).map(m => ({ id: m.id, name: QC.pick(m.name, lang), icon: m.icon || '', watts: m.watts, defaultHours: m.defaultHours, optional: !!m.optional }));
    const materialised = QC.materialiseRows(content, rows, lang);
    send(res, 200, {
      kw, profileKey, dailyGenPerKw: gen,
      dailyGeneration: QC.dailyGenerationForKw(kw, gen),
      rows: materialised, totalUnits: QC.totalUnits(materialised),
      master, contentVersion: getPublishedVersion(),
    });
  }));
}

module.exports = { init, register, getPublishedContent, getPublishedVersion, getStore: () => STORE, persist, STORE_FILE };
