// Golden Ray BOM Server — ZERO DEPENDENCIES (pure Node.js)
// Just run: node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = process.env.PORT || 4800;

// ESM offer lifecycle — loaded in startup sequence
let OL = null;
const DATA_FILE = path.join(__dirname, 'data', 'catalog.json');
const BOM_STATE_FILE = path.join(__dirname, 'data', 'bom-state.json');
const BACKUP_DIR = path.join(__dirname, 'data', 'backups');
const DIST_DIR = path.join(__dirname, 'dist');

// --- BOM State persistence ---
function readBomState() {
  try { return JSON.parse(fs.readFileSync(BOM_STATE_FILE, 'utf-8')); }
  catch (e) { return {}; }
}
function writeBomState(state) {
  fs.writeFileSync(BOM_STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

// --- MIME types ---
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.map': 'application/json'
};

// --- Data helpers ---
function readData() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
}

function writeData(data) {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(BACKUP_DIR, `catalog_${timestamp}.json`);
  try { fs.copyFileSync(DATA_FILE, backupPath); } catch (e) { /* first write */ }
  const backups = fs.readdirSync(BACKUP_DIR).sort();
  while (backups.length > 50) fs.unlinkSync(path.join(BACKUP_DIR, backups.shift()));
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function generateId(prefix) {
  return prefix + '_' + crypto.randomBytes(6).toString('hex');
}

// --- Auth ---
// SECURITY (Phase 0 hotfix): credential comes from the environment only.
// No default, no fallback, never logged. Server refuses to start without it.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD || String(ADMIN_PASSWORD).trim() === '') {
  console.error('');
  console.error('FATAL: ADMIN_PASSWORD environment variable is not set.');
  console.error('');
  console.error('  The server will not start without it. There is no default password.');
  console.error('  Set it in the environment of the process manager, e.g.:');
  console.error('');
  console.error('    ADMIN_PASSWORD=<value> node server.js');
  console.error('');
  console.error('  Never commit the value. Never log it.');
  console.error('');
  process.exit(1);
}

// --- User authentication system ---
// server-users.js provides authenticated sessions with userId/role binding.
// The old shared-password sessions are replaced; isAdmin and actorOf now
// derive identity from the authenticated session, not client headers.
const userAuth = require('./server-users.js');

// --- HTTP helpers ---
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) { reject(new Error('Body too large')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (e) { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function send(res, status, data) {
  const json = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,PATCH,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Actor-Role,X-Actor-User'
  });
  res.end(json);
}

// Cache policy (P0.3, 2026-09-13). Code files (.html/.js/.css/.json/.map) are
// served `no-cache` with an ETag, so the browser re-validates on every load
// and gets a cheap 304 when nothing changed — a deploy is visible on the next
// page load, never a year later. Only immutable binary assets under /assets/
// (images, fonts, campaign artwork) keep the long max-age.
// Before this change /lib/*.js was `max-age=31536000` with no version hash:
// Sales kept running the previous renderer after every update (the "preview
// looks wrong, PDF is right" report — the headless PDF browser has no cache).
const CODE_EXT = new Set(['.html', '.js', '.css', '.json', '.map']);
function cacheHeadersFor(filePath, ext) {
  if (CODE_EXT.has(ext)) {
    return { 'Cache-Control': 'no-cache, must-revalidate, max-age=0', 'Pragma': 'no-cache', 'Expires': '0' };
  }
  const rel = path.relative(__dirname, filePath).split(path.sep).join('/');
  const immutable = /^(public\/)?assets\//.test(rel) || /^dist\/assets\//.test(rel);
  return { 'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=3600' };
}

function sendFile(res, filePath, req) {
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  try {
    const stat = fs.statSync(filePath);
    // Weak ETag from size + mtime: no hashing cost, changes whenever the file does.
    const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
    const headers = { 'Content-Type': mime, 'ETag': etag, 'Last-Modified': stat.mtime.toUTCString(), ...cacheHeadersFor(filePath, ext) };
    const inm = req && req.headers && req.headers['if-none-match'];
    if (inm && inm.split(',').map(s => s.trim()).includes(etag)) {
      res.writeHead(304, headers);
      res.end();
      return true;
    }
    const content = fs.readFileSync(filePath);
    res.writeHead(200, headers);
    res.end(content);
  } catch (e) {
    return false;
  }
  return true;
}

// Identity functions — derived from authenticated session, not client headers.
// userAuth.actorOf(req) is the ONLY way to derive identity.
const { isAdmin, actorOf, isAuthenticated } = userAuth;

// --- Route matching ---
function matchRoute(method, urlPath) {
  // Returns [handler, params] or null
  for (const route of routes) {
    if (route.method !== method) continue;
    const match = route.regex.exec(urlPath);
    if (match) {
      const params = {};
      route.keys.forEach((key, i) => { params[key] = match[i + 1]; });
      return [route.handler, params];
    }
  }
  return null;
}

const routes = [];
function addRoute(method, pattern, handler) {
  const keys = [];
  const regexStr = pattern.replace(/:([a-zA-Z_]+)/g, (_, key) => {
    keys.push(key);
    return '([^/]+)';
  });
  routes.push({ method, regex: new RegExp('^' + regexStr + '$'), keys, handler });
}

// ===== PUBLIC API =====

// Catalog visibility (2026-09-08 security tightening):
//   ADMIN                          → everything
//   PROJECT_HEAD / ENGINEERING /
//   PROCUREMENT                    → everything, items keep the reference `price`
//                                    (needed to author packs / judge swaps); the
//                                    procurement fields landedUnitCost /
//                                    purchasePrice / supplier are stripped
//   Sales roles / unauthenticated  → component master without any price field
//                                    and WITHOUT the internal cost sections
//                                    (costs, installationMatrix, structure
//                                    material tables, office expense, fixed-item
//                                    prices). marketRates stay: they are the
//                                    customer price list, not a cost.
const CATALOG_INTERNAL_SECTIONS = ['costs', 'installationMatrix', 'structureTemplates', 'tubeWeights', 'officeExpense', 'bomState'];
const CATALOG_STAFF_ROLES = ['PROJECT_HEAD', 'ENGINEERING', 'PROCUREMENT'];
function catalogViewFor(data, actor) {
  const { adminPasswordHash, adminPassword, ...full } = data;
  if (actor?.role === 'ADMIN') return full;
  const mapItems = (fn) => Object.fromEntries(Object.entries(full.categories || {}).map(([k, cat]) => [k, { ...cat, items: (cat.items || []).map(fn) }]));
  if (actor && CATALOG_STAFF_ROLES.includes(actor.role)) {
    return { ...full, categories: mapItems(item => { const { landedUnitCost, purchasePrice, supplier, ...rest } = item; return rest; }) };
  }
  const pub = { ...full, categories: mapItems(item => { const { perWatt, price, landedUnitCost, purchasePrice, supplier, ...rest } = item; return rest; }) };
  for (const k of CATALOG_INTERNAL_SECTIONS) delete pub[k];
  if (pub.transportConfig) pub.transportConfig = { baseDistanceKm: pub.transportConfig.baseDistanceKm };
  if (pub.bomTemplates) {
    pub.bomTemplates = Object.fromEntries(Object.entries(pub.bomTemplates).map(([sys, t]) => [sys, {
      ...t, fixedItems: (t.fixedItems || []).map(({ price, ...rest }) => rest),
    }]));
  }
  return pub;
}

addRoute('GET', '/api/catalog', async (req, res) => {
  const data = readData();
  send(res, 200, catalogViewFor(data, actorOf(req)));
});

addRoute('GET', '/api/catalog/:category', async (req, res, params) => {
  const data = readData();
  const cat = data.categories[params.category];
  if (!cat) return send(res, 404, { error: 'Category not found' });
  const view = catalogViewFor(data, actorOf(req));
  send(res, 200, view.categories[params.category]);
});

// Upgrade paths — read from upgradeModel.js (authoritative source, decision C10)
let _upgradePaths = null;
addRoute('GET', '/api/upgrade-paths', async (req, res) => {
  if (!isAuthenticated(req)) return send(res, 401, { error: 'Unauthorized' });
  if (!_upgradePaths) {
    try { const m = await import('./src/lib/upgradeModel.js'); _upgradePaths = m.APPROVED_UPGRADE_PATHS; }
    catch { _upgradePaths = []; }
  }
  // Sales-safe: only fromKw, toKw, id — no internal BOM details
  send(res, 200, { paths: _upgradePaths.map(p => ({ id: p.id, fromKw: p.fromKw, toKw: p.toKw })) });
});

// Auth routes are registered by userAuth.init() below — /api/auth/login,
// /api/auth/logout, /api/auth/session, and legacy /api/auth.

addRoute('GET', '/api/offers', async (req, res) => {
  // Authenticated endpoint — returns ACTIVE offers only, stripped of admin metadata.
  // Full offer listing (all statuses + audit trail) at GET /api/admin/offers (isAdmin).
  if (!isAuthenticated(req)) return send(res, 401, { error: 'Unauthorized' });
  const data = readData();
  const now = new Date().toISOString().slice(0, 10);
  // Auto-expire past-endDate offers before filtering
  if (OL) OL.autoExpireOffers(data.offers || [], now);
  const offers = (data.offers || []).filter(o =>
    o.status === 'ACTIVE' &&
    (!o.startDate || o.startDate <= now) &&
    (!o.endDate || o.endDate >= now)
  ).map(o => ({
    // Strip admin-internal fields (createdBy, changedBy, transitions, offerVersion)
    id: o.id, name: o.name, type: o.type, value: o.value,
    appliesTo: o.appliesTo, appliesToTier: o.appliesToTier,
    appliesToSize: o.appliesToSize || 'all',
    startDate: o.startDate, endDate: o.endDate,
    description: o.description, status: o.status,
  }));
  // Persist any auto-expirations
  writeData(data);
  send(res, 200, { offers });
});

addRoute('GET', '/api/health', async (req, res) => {
  send(res, 200, { status: 'ok', timestamp: new Date().toISOString() });
});

// ===== ADMIN API =====

addRoute('POST', '/api/admin/catalog/:category', async (req, res, params) => {
  if (!isAdmin(req)) return send(res, 401, { error: 'Unauthorized' });
  const data = readData();
  if (!data.categories[params.category]) return send(res, 404, { error: 'Category not found' });
  const body = await parseBody(req);
  const newItem = { id: generateId(params.category.substring(0, 2)), ...body };
  if (!newItem.name) return send(res, 400, { error: 'Name is required' });
  if (!newItem.tiers || !Array.isArray(newItem.tiers)) return send(res, 400, { error: 'Tiers must be an array' });
  data.categories[params.category].items.push(newItem);
  writeData(data);
  send(res, 201, newItem);
});

addRoute('PUT', '/api/admin/catalog/:category/:id', async (req, res, params) => {
  if (!isAdmin(req)) return send(res, 401, { error: 'Unauthorized' });
  const data = readData();
  if (!data.categories[params.category]) return send(res, 404, { error: 'Category not found' });
  const idx = data.categories[params.category].items.findIndex(i => i.id === params.id);
  if (idx === -1) return send(res, 404, { error: 'Item not found' });
  const body = await parseBody(req);
  data.categories[params.category].items[idx] = { ...data.categories[params.category].items[idx], ...body, id: params.id };
  writeData(data);
  send(res, 200, data.categories[params.category].items[idx]);
});

// ===== ITEMS & PRICES (2026-09-09) =====
// The simple item manager normal users asked for: add a panel / inverter /
// any catalog item, set its reference price, tiers, DCR, warranty, retire it.
//   ADMIN / PROJECT_HEAD  → add (APPROVED), edit, approve, retire
//   PROCUREMENT           → add (PENDING until PH/Admin approves), edit price / brand / model
//   ENGINEERING           → read
// Every write is audited on the item (updatedBy / updatedAt / changeLog).
// Prices here are the reference material prices the pack formula uses for
// swap deltas and the internal margin check — never shown to Sales.
const ITEM_ROLES_READ = ['ADMIN', 'PROJECT_HEAD', 'PROCUREMENT', 'ENGINEERING'];
const ITEM_ROLES_WRITE = ['ADMIN', 'PROJECT_HEAD', 'PROCUREMENT'];
const ITEM_ROLES_APPROVE = ['ADMIN', 'PROJECT_HEAD'];
const ITEM_COMMON_FIELDS = ['name', 'brand', 'model', 'price', 'tiers', 'status', 'warranty', 'unit', 'note'];
const ITEM_CATEGORY_FIELDS = {
  panel: ['watt', 'dcr', 'panelType', 'voc', 'vmp', 'isc', 'imp', 'cells'],
  inverter: ['kw', 'phase', 'type', 'mpptCount', 'maxInputVoltage', 'deviceType'],
  battery: ['kwh', 'capacityAh', 'voltage', 'phase'],
  dcdb: ['phase'], acdb: ['phase', 'type'], meter: ['phase'], isolator: ['phase'], mccb_box: ['rating'],
  dc_cable: ['sqmm'], ac_cable: ['sqmm'], earth_cable: ['sqmm'], la_cable: ['sqmm'], armoured_cable: ['sqmm', 'core'],
  structure_material: ['tubeSize', 'structureRole', 'specification'],
};
const ITEM_NUMERIC = new Set(['price', 'watt', 'kw', 'kwh', 'capacityAh', 'voltage', 'voc', 'vmp', 'isc', 'imp', 'cells', 'mpptCount', 'maxInputVoltage', 'sqmm', 'core']);
function itemActor(req, res, roles) {
  const actor = actorOf(req);
  if (!actor) { send(res, 401, { error: 'Unauthorized', code: 'UNAUTHENTICATED' }); return null; }
  if (!roles.includes(actor.role)) { send(res, 403, { error: 'Not permitted for your role', code: 'CAPABILITY_DENIED' }); return null; }
  return actor;
}
function sanitizeItemPatch(category, body) {
  const allowed = [...ITEM_COMMON_FIELDS, ...(ITEM_CATEGORY_FIELDS[category] || [])];
  const out = {}; const errors = [];
  for (const k of allowed) {
    if (!(k in body)) continue;
    let v = body[k];
    if (v === '' || v === undefined) v = null;
    if (k === 'tiers') { if (!Array.isArray(v) || !v.every(t => ['base', 'value', 'premium'].includes(t))) { errors.push('tiers must be a list of base / value / premium'); continue; } }
    else if (k === 'dcr') v = v === true || v === 'true';
    else if (ITEM_NUMERIC.has(k) && v != null) { v = Number(v); if (!Number.isFinite(v) || v < 0) { errors.push(`${k} must be a number ≥ 0`); continue; } }
    else if (k === 'status' && v != null && !['ACTIVE', 'RETIRED'].includes(String(v).toUpperCase())) { errors.push('status must be ACTIVE or RETIRED'); continue; }
    else if (typeof v === 'string') v = v.trim().slice(0, 200);
    if (k === 'status' && v != null) v = String(v).toUpperCase();
    if (k === 'panelType' && v != null) v = String(v).toUpperCase() === 'NON_DCR' || String(v).toUpperCase() === 'NDCR' ? 'NON_DCR' : 'DCR';
    out[k] = v;
  }
  if ('dcr' in out && !('panelType' in out)) out.panelType = out.dcr ? 'DCR' : 'NON_DCR';
  if ('panelType' in out && !('dcr' in out)) out.dcr = out.panelType === 'DCR';
  return { out, errors };
}
addRoute('GET', '/api/items', async (req, res) => {
  const actor = itemActor(req, res, ITEM_ROLES_READ); if (!actor) return;
  const data = readData();
  const categories = Object.entries(data.categories || {}).map(([key, cat]) => ({
    key, label: cat.label || key, gstDefault: cat.gstDefault ?? 18, fields: ITEM_CATEGORY_FIELDS[key] || [],
    items: (cat.items || []).map(({ landedUnitCost, purchasePrice, supplier, ...item }) => item),
  }));
  send(res, 200, { categories, roles: { canWrite: ITEM_ROLES_WRITE.includes(actor.role), canApprove: ITEM_ROLES_APPROVE.includes(actor.role) }, commonFields: ITEM_COMMON_FIELDS });
});
addRoute('POST', '/api/items/:category', async (req, res, params) => {
  const actor = itemActor(req, res, ITEM_ROLES_WRITE); if (!actor) return;
  const data = readData();
  const cat = data.categories[params.category];
  if (!cat) return send(res, 404, { error: 'Category not found' });
  const body = await parseBody(req);
  if (!body.at) return send(res, 400, { error: 'Timestamp (at) is required.', code: 'MISSING_TIMESTAMP' });
  const { out, errors } = sanitizeItemPatch(params.category, body);
  if (!out.name) errors.push('name is required');
  if (!Array.isArray(out.tiers) || !out.tiers.length) errors.push('choose at least one tier (base / value / premium)');
  if (params.category === 'panel' && !(out.watt > 0)) errors.push('panel watt is required');
  if (params.category === 'inverter' && !(out.kw > 0)) errors.push('inverter kW is required');
  if (errors.length) return send(res, 400, { error: errors.join('; '), code: 'INVALID_VALUE' });
  if (cat.items.some(i => i.name.trim().toLowerCase() === out.name.toLowerCase())) return send(res, 409, { error: `An item named "${out.name}" already exists in ${cat.label || params.category}`, code: 'DUPLICATE_NAME' });
  const item = {
    id: generateId(params.category.substring(0, 2)), ...out,
    status: 'ACTIVE',
    // Procurement adds items for engineering to approve; PH / Admin additions are approved directly.
    approvalStatus: ITEM_ROLES_APPROVE.includes(actor.role) ? 'APPROVED' : 'PENDING',
    createdBy: actor.userId, createdAt: body.at, updatedBy: actor.userId, updatedAt: body.at,
    changeLog: [{ at: body.at, by: actor.userId, role: actor.role, action: 'CREATED' }],
  };
  if (params.category === 'panel' && item.watt && item.price) item.perWatt = Math.round((item.price / item.watt) * 100) / 100;
  cat.items.push(item);
  writeData(data);
  send(res, 201, item);
});
addRoute('PATCH', '/api/items/:category/:id', async (req, res, params) => {
  const actor = itemActor(req, res, ITEM_ROLES_WRITE); if (!actor) return;
  const data = readData();
  const cat = data.categories[params.category];
  if (!cat) return send(res, 404, { error: 'Category not found' });
  const item = cat.items.find(i => i.id === params.id);
  if (!item) return send(res, 404, { error: 'Item not found' });
  const body = await parseBody(req);
  if (!body.at) return send(res, 400, { error: 'Timestamp (at) is required.', code: 'MISSING_TIMESTAMP' });
  const { out, errors } = sanitizeItemPatch(params.category, body);
  if (errors.length) return send(res, 400, { error: errors.join('; '), code: 'INVALID_VALUE' });
  if ('approvalStatus' in body) {
    if (!ITEM_ROLES_APPROVE.includes(actor.role)) return send(res, 403, { error: 'Only Project Head or Admin approves items', code: 'CAPABILITY_DENIED' });
    if (!['APPROVED', 'PENDING', 'REJECTED'].includes(body.approvalStatus)) return send(res, 400, { error: 'approvalStatus must be APPROVED / PENDING / REJECTED', code: 'INVALID_VALUE' });
    out.approvalStatus = body.approvalStatus;
  }
  const changed = {};
  for (const [k, v] of Object.entries(out)) if (JSON.stringify(item[k] ?? null) !== JSON.stringify(v)) { changed[k] = { from: item[k] ?? null, to: v }; if (v === null) delete item[k]; else item[k] = v; }
  if (!Object.keys(changed).length) return send(res, 200, { item, changed });
  if (params.category === 'panel' && item.watt && item.price) item.perWatt = Math.round((item.price / item.watt) * 100) / 100;
  item.updatedBy = actor.userId; item.updatedAt = body.at;
  item.changeLog = [...(item.changeLog || []), { at: body.at, by: actor.userId, role: actor.role, changed }].slice(-20);
  writeData(data);
  send(res, 200, { item, changed });
});

// Warranty is a customer-facing display attribute (§15: no generic warranty
// statement — the item must carry it). Admin and Project Head may set it, e.g.
// from the kW Packs workspace, without the full admin item editor.
addRoute('PATCH', '/api/catalog/:category/:id/warranty', async (req, res, params) => {
  const actor = actorOf(req);
  if (!actor || !['ADMIN', 'PROJECT_HEAD'].includes(actor.role)) return send(res, actor ? 403 : 401, { error: actor ? 'Warranty is set by Admin or Project Head' : 'Unauthorized', code: actor ? 'CAPABILITY_DENIED' : 'UNAUTHENTICATED' });
  const data = readData();
  const cat = data.categories[params.category];
  if (!cat) return send(res, 404, { error: 'Category not found' });
  const item = cat.items.find(i => i.id === params.id);
  if (!item) return send(res, 404, { error: 'Item not found' });
  const body = await parseBody(req);
  const w = body.warranty == null || body.warranty === '' ? null : String(body.warranty).trim().slice(0, 60);
  if (w == null) delete item.warranty; else item.warranty = w;
  item.warrantyUpdatedBy = actor.userId; item.warrantyUpdatedAt = body.at || null;
  writeData(data);
  send(res, 200, { id: item.id, warranty: item.warranty ?? null });
});

// Battery master — engineering facts for a battery (owner Q8: "MCCB rating added
// when setting the BOM"). Engineering / Project Head / Admin record the external
// protection device rating and related electrical facts; nothing is derived.
// The checker (PBC-H-002) unblocks hybrid packs only once a rating is recorded.
const BATTERY_MASTER_FILE = path.join(__dirname, 'data', 'battery-master.json');
const BATTERY_MASTER_EDITABLE = ['protectionRating', 'protectionType', 'maximumDischargeCurrent', 'maximumChargeCurrent', 'continuousDischargeCurrent', 'nominalVoltage', 'capacityKwh', 'usableCapacityKwh', 'communicationProtocol', 'engineeringNotes'];
addRoute('PATCH', '/api/engineering/battery-master/:id', async (req, res, params) => {
  const actor = actorOf(req);
  if (!actor) return send(res, 401, { error: 'Unauthorized', code: 'UNAUTHENTICATED' });
  if (!['ADMIN', 'PROJECT_HEAD', 'ENGINEERING'].includes(actor.role)) return send(res, 403, { error: 'Battery master is edited by Engineering, Project Head or Admin', code: 'CAPABILITY_DENIED' });
  const body = await parseBody(req);
  if (!body.at) return send(res, 400, { error: 'Timestamp (at) is required.', code: 'MISSING_TIMESTAMP' });
  let master; try { master = JSON.parse(fs.readFileSync(BATTERY_MASTER_FILE, 'utf-8')); } catch { return send(res, 500, { error: 'battery-master.json unreadable' }); }
  const rec = master.batteries?.[params.id];
  if (!rec) return send(res, 404, { error: `Battery ${params.id} not in battery master` });
  const changed = {};
  for (const k of BATTERY_MASTER_EDITABLE) {
    if (!(k in body)) continue;
    let v = body[k];
    if (v === '' ) v = null;
    if (['maximumDischargeCurrent', 'maximumChargeCurrent', 'continuousDischargeCurrent', 'nominalVoltage', 'capacityKwh', 'usableCapacityKwh'].includes(k) && v != null) { v = Number(v); if (!Number.isFinite(v) || v < 0) return send(res, 400, { error: `${k} must be a number ≥ 0`, code: 'INVALID_VALUE' }); }
    if (typeof v === 'string') v = v.trim().slice(0, 200);
    if (rec[k] !== v) { changed[k] = { from: rec[k] ?? null, to: v }; rec[k] = v; }
  }
  if (!Object.keys(changed).length) return send(res, 200, { id: params.id, changed: {}, record: rec });
  rec.updatedBy = actor.userId; rec.updatedAt = body.at;
  rec.changeLog = [...(rec.changeLog || []), { at: body.at, by: actor.userId, role: actor.role, changed }].slice(-50);
  master.updatedAt = body.at;
  fs.writeFileSync(BATTERY_MASTER_FILE, JSON.stringify(master, null, 2) + '\n', 'utf-8');
  try { workspace.rebuildEnv(); } catch { /* env rebuilt on next boot */ }
  send(res, 200, { id: params.id, changed, record: rec });
});
addRoute('GET', '/api/engineering/battery-master', async (req, res) => {
  const actor = actorOf(req);
  if (!actor) return send(res, 401, { error: 'Unauthorized', code: 'UNAUTHENTICATED' });
  if (!['ADMIN', 'PROJECT_HEAD', 'ENGINEERING', 'PROCUREMENT'].includes(actor.role)) return send(res, 403, { error: 'Battery master is not visible to Sales', code: 'CAPABILITY_DENIED' });
  let master; try { master = JSON.parse(fs.readFileSync(BATTERY_MASTER_FILE, 'utf-8')); } catch { master = { batteries: {} }; }
  send(res, 200, { batteries: master.batteries || {}, editable: BATTERY_MASTER_EDITABLE });
});

addRoute('DELETE', '/api/admin/catalog/:category/:id', async (req, res, params) => {
  if (!isAdmin(req)) return send(res, 401, { error: 'Unauthorized' });
  const data = readData();
  if (!data.categories[params.category]) return send(res, 404, { error: 'Category not found' });
  const before = data.categories[params.category].items.length;
  data.categories[params.category].items = data.categories[params.category].items.filter(i => i.id !== params.id);
  if (data.categories[params.category].items.length === before) return send(res, 404, { error: 'Item not found' });
  writeData(data);
  send(res, 200, { success: true, deleted: params.id });
});

addRoute('PATCH', '/api/admin/catalog/:category/:id/tiers', async (req, res, params) => {
  if (!isAdmin(req)) return send(res, 401, { error: 'Unauthorized' });
  const data = readData();
  if (!data.categories[params.category]) return send(res, 404, { error: 'Category not found' });
  const body = await parseBody(req);
  if (!Array.isArray(body.tiers)) return send(res, 400, { error: 'Tiers must be an array' });
  const item = data.categories[params.category].items.find(i => i.id === params.id);
  if (!item) return send(res, 404, { error: 'Item not found' });
  item.tiers = body.tiers;
  writeData(data);
  send(res, 200, item);
});

addRoute('PUT', '/api/admin/structure-templates', async (req, res) => {
  if (!isAdmin(req)) return send(res, 401, { error: 'Unauthorized' });
  const body = await parseBody(req);
  if (!body.templateKey || !body.items) return send(res, 400, { error: 'templateKey and items required' });
  const data = readData();
  if (!data.structureTemplates?.[body.templateKey]) return send(res, 404, { error: 'Template not found' });
  data.structureTemplates[body.templateKey].items = body.items;
  writeData(data);
  const packConfigMirror = packConfig.mirrorLegacyWrite({ actor: actorOf(req), section: 'structureTemplates', at: body.at, patch: (cur) => ({ ...cur, [body.templateKey]: { ...(cur[body.templateKey] || {}), items: body.items } }) });
  send(res, 200, { ...data.structureTemplates[body.templateKey], packConfigMirror });
});

addRoute('GET', '/api/admin/offers', async (req, res) => {
  if (!isAdmin(req)) return send(res, 401, { error: 'Unauthorized' });
  const data = readData();
  // Auto-expire past-endDate offers
  const now = new Date().toISOString().slice(0, 10);
  if (OL) {
    const expired = OL.autoExpireOffers(data.offers || [], now);
    if (expired.length > 0) writeData(data);
  }
  send(res, 200, data.offers || []);
});

addRoute('POST', '/api/admin/offers', async (req, res) => {
  if (!isAdmin(req)) return send(res, 401, { error: 'Unauthorized' });
  const actor = actorOf(req);
  const data = readData();
  if (!data.offers) data.offers = [];
  const body = await parseBody(req);

  // Validate the offer definition
  if (OL) {
    const validation = OL.validateOffer(body);
    if (!validation.valid) {
      return send(res, 400, { error: 'Offer validation failed', errors: validation.errors });
    }
  }

  // Create as DRAFT
  const offer = OL
    ? OL.createDraftOffer(body, actor?.userId || 'admin')
    : {
        id: 'offer_' + Date.now(),
        name: body.name || 'New Offer',
        type: body.type || 'flat',
        value: Number(body.value) || 0,
        appliesTo: body.appliesTo || 'all',
        appliesToTier: body.appliesToTier || 'all',
        appliesToSize: body.appliesToSize || 'all',
        startDate: body.startDate || '',
        endDate: body.endDate || '',
        status: 'DRAFT',
        active: false,
        offerVersion: 1,
        createdAt: new Date().toISOString(),
        createdBy: actor?.userId || 'admin',
      };

  data.offers.push(offer);
  writeData(data);
  send(res, 201, offer);
});

addRoute('PUT', '/api/admin/offers/:id', async (req, res, params) => {
  if (!isAdmin(req)) return send(res, 401, { error: 'Unauthorized' });
  const actor = actorOf(req);
  const data = readData();
  if (!data.offers) data.offers = [];
  const idx = data.offers.findIndex(o => o.id === params.id);
  if (idx < 0) return send(res, 404, { error: 'Offer not found' });
  const body = await parseBody(req);

  if (OL) {
    try {
      const { offer, reverted } = OL.updateOffer(data.offers[idx], body, actor?.userId || 'admin');
      data.offers[idx] = offer;
      writeData(data);
      send(res, 200, { offer, reverted });
    } catch (err) {
      if (err.name === 'OfferError') {
        return send(res, 409, { error: err.message, code: err.code, detail: err.detail });
      }
      throw err;
    }
  } else {
    data.offers[idx] = { ...data.offers[idx], ...body, id: params.id };
    writeData(data);
    send(res, 200, data.offers[idx]);
  }
});

// ---- Offer lifecycle transitions ----

addRoute('POST', '/api/admin/offers/:id/approve', async (req, res, params) => {
  if (!isAdmin(req)) return send(res, 401, { error: 'Unauthorized' });
  if (!OL) return send(res, 503, { error: 'Offer lifecycle not initialised' });
  const actor = actorOf(req);
  const data = readData();
  if (!data.offers) data.offers = [];
  const offer = data.offers.find(o => o.id === params.id);
  if (!offer) return send(res, 404, { error: 'Offer not found' });

  // Parse optional body for margin check context
  const body = await parseBody(req);

  // Validate offer definition before approval
  const validation = OL.validateOffer(offer);
  if (!validation.valid) {
    return send(res, 400, { error: 'Offer validation failed', errors: validation.errors });
  }

  // Run margin safety check if listPrice and cost are provided
  let marginResult = null;
  if (body.listPrice && body.cost) {
    const minMargin = body.minMargin ?? 0.15;
    marginResult = OL.marginSafetyCheck(body.listPrice, body.cost, offer, minMargin);
    if (!marginResult.safe) {
      return send(res, 422, {
        error: 'Margin safety check failed',
        code: 'MARGIN_BREACH',
        detail: marginResult,
      });
    }
  }

  try {
    const { offer: updated, transition } = OL.transitionOffer(
      offer, OL.OFFER_STATUS.APPROVED, actor?.userId || 'admin', body.reason || 'Approved by admin'
    );
    writeData(data);
    send(res, 200, { offer: updated, transition, marginCheck: marginResult });
  } catch (err) {
    if (err.name === 'OfferError') {
      return send(res, 409, { error: err.message, code: err.code, detail: err.detail });
    }
    throw err;
  }
});

addRoute('POST', '/api/admin/offers/:id/activate', async (req, res, params) => {
  if (!isAdmin(req)) return send(res, 401, { error: 'Unauthorized' });
  if (!OL) return send(res, 503, { error: 'Offer lifecycle not initialised' });
  const actor = actorOf(req);
  const data = readData();
  if (!data.offers) data.offers = [];
  const offer = data.offers.find(o => o.id === params.id);
  if (!offer) return send(res, 404, { error: 'Offer not found' });

  const body = await parseBody(req);

  try {
    const { offer: updated, transition } = OL.transitionOffer(
      offer, OL.OFFER_STATUS.ACTIVE, actor?.userId || 'admin', body.reason || 'Activated by admin'
    );
    writeData(data);
    send(res, 200, { offer: updated, transition });
  } catch (err) {
    if (err.name === 'OfferError') {
      return send(res, 409, { error: err.message, code: err.code, detail: err.detail });
    }
    throw err;
  }
});

addRoute('POST', '/api/admin/offers/:id/expire', async (req, res, params) => {
  if (!isAdmin(req)) return send(res, 401, { error: 'Unauthorized' });
  if (!OL) return send(res, 503, { error: 'Offer lifecycle not initialised' });
  const actor = actorOf(req);
  const data = readData();
  if (!data.offers) data.offers = [];
  const offer = data.offers.find(o => o.id === params.id);
  if (!offer) return send(res, 404, { error: 'Offer not found' });

  const body = await parseBody(req);

  try {
    const { offer: updated, transition } = OL.transitionOffer(
      offer, OL.OFFER_STATUS.EXPIRED, actor?.userId || 'admin', body.reason || 'Manually expired by admin'
    );
    writeData(data);
    send(res, 200, { offer: updated, transition });
  } catch (err) {
    if (err.name === 'OfferError') {
      return send(res, 409, { error: err.message, code: err.code, detail: err.detail });
    }
    throw err;
  }
});

addRoute('POST', '/api/admin/offers/:id/archive', async (req, res, params) => {
  if (!isAdmin(req)) return send(res, 401, { error: 'Unauthorized' });
  if (!OL) return send(res, 503, { error: 'Offer lifecycle not initialised' });
  const actor = actorOf(req);
  const data = readData();
  if (!data.offers) data.offers = [];
  const offer = data.offers.find(o => o.id === params.id);
  if (!offer) return send(res, 404, { error: 'Offer not found' });

  const body = await parseBody(req);

  try {
    const { offer: updated, transition } = OL.transitionOffer(
      offer, OL.OFFER_STATUS.ARCHIVED, actor?.userId || 'admin', body.reason || 'Archived by admin'
    );
    writeData(data);
    send(res, 200, { offer: updated, transition });
  } catch (err) {
    if (err.name === 'OfferError') {
      return send(res, 409, { error: err.message, code: err.code, detail: err.detail });
    }
    throw err;
  }
});

addRoute('DELETE', '/api/admin/offers/:id', async (req, res, params) => {
  if (!isAdmin(req)) return send(res, 401, { error: 'Unauthorized' });
  const actor = actorOf(req);
  const data = readData();
  if (!data.offers) data.offers = [];
  const offer = data.offers.find(o => o.id === params.id);
  if (!offer) return send(res, 404, { error: 'Offer not found' });

  // Soft delete: archive instead of hard delete
  if (OL && offer.status !== OL.OFFER_STATUS.ARCHIVED) {
    try {
      OL.transitionOffer(offer, OL.OFFER_STATUS.ARCHIVED, actor?.userId || 'admin', 'Soft-deleted (archived)');
    } catch (err) {
      // Already archived or invalid transition — still return success
    }
  } else if (!OL) {
    offer.status = 'ARCHIVED';
    offer.active = false;
    offer.changedAt = new Date().toISOString();
  }
  writeData(data);
  send(res, 200, { ok: true, archived: true, offer });
});

addRoute('PUT', '/api/admin/costs', async (req, res) => {
  if (!isAdmin(req)) return send(res, 401, { error: 'Unauthorized' });
  const data = readData();
  const body = await parseBody(req);
  data.costs = { ...data.costs, ...body };
  writeData(data);
  const { at: _at, ...costPatch } = body;
  const packConfigMirror = packConfig.mirrorLegacyWrite({ actor: actorOf(req), section: 'costs', at: _at, patch: (cur) => ({ ...cur, ...costPatch }) });
  send(res, 200, { ...data.costs, packConfigMirror });
});

// Package Engineering Profiles — config-driven structure/inverter/battery per package
addRoute('PUT', '/api/admin/package-profiles', async (req, res) => {
  if (!isAdmin(req)) return send(res, 401, { error: 'Unauthorized' });
  const data = readData();
  const body = await parseBody(req);
  if (!data.packageProfiles) data.packageProfiles = {};
  data.packageProfiles = { ...data.packageProfiles, ...body };
  writeData(data);
  send(res, 200, data.packageProfiles);
});

// Installation Cost Matrix — size x roofType
addRoute('PUT', '/api/admin/installation-matrix', async (req, res) => {
  if (!isAdmin(req)) return send(res, 401, { error: 'Unauthorized' });
  const data = readData();
  const body = await parseBody(req);
  if (!data.installationMatrix) data.installationMatrix = {};
  const { at: _at, ...matrixPatch } = body;
  for (const [size, roofCosts] of Object.entries(matrixPatch)) {
    if (!data.installationMatrix[size]) data.installationMatrix[size] = {};
    Object.assign(data.installationMatrix[size], roofCosts);
  }
  writeData(data);
  const packConfigMirror = packConfig.mirrorLegacyWrite({ actor: actorOf(req), section: 'installationMatrix', at: _at, patch: (cur) => { const n = { ...cur }; for (const [size, rc] of Object.entries(matrixPatch)) n[size] = { ...(n[size] || {}), ...rc }; return n; } });
  send(res, 200, { ...data.installationMatrix, packConfigMirror });
});

// Transport Config — baseDistanceKm + costPerKm
addRoute('PUT', '/api/admin/transport-config', async (req, res) => {
  if (!isAdmin(req)) return send(res, 401, { error: 'Unauthorized' });
  const data = readData();
  const body = await parseBody(req);
  const { at: _at, ...transportPatch } = body;
  data.transportConfig = { ...(data.transportConfig || {}), ...transportPatch };
  writeData(data);
  const packConfigMirror = packConfig.mirrorLegacyWrite({ actor: actorOf(req), section: 'transportConfig', at: _at, patch: (cur) => {
    const n = { ...cur, ...transportPatch };
    // legacy costPerKm → the single-vehicle rate when the vehicles table has one row
    if (transportPatch.costPerKm != null && Array.isArray(n.vehicles) && n.vehicles.length === 1) n.vehicles = [{ ...n.vehicles[0], ratePerKm: transportPatch.costPerKm }];
    return n;
  } });
  send(res, 200, { ...data.transportConfig, packConfigMirror });
});

// Office Expense — monthlyExpense + expectedProjectsPerMonth
addRoute('PUT', '/api/admin/office-expense', async (req, res) => {
  if (!isAdmin(req)) return send(res, 401, { error: 'Unauthorized' });
  const data = readData();
  const body = await parseBody(req);
  data.officeExpense = { ...(data.officeExpense || {}), ...body };
  writeData(data);
  send(res, 200, data.officeExpense);
});

addRoute('PUT', '/api/admin/market-rates', async (req, res) => {
  if (!isAdmin(req)) return send(res, 401, { error: 'Unauthorized' });
  const data = readData();
  if (!data.marketRates) data.marketRates = {};
  const body = await parseBody(req);
  const { at: _at, ...ratePatch } = body;
  for (const [key, sizes] of Object.entries(ratePatch)) {
    if (!data.marketRates[key]) data.marketRates[key] = {};
    Object.assign(data.marketRates[key], sizes);
  }
  writeData(data);
  const packConfigMirror = packConfig.mirrorLegacyWrite({ actor: actorOf(req), section: 'marketRates', at: _at, patch: (cur) => { const n = { ...cur }; for (const [k, sizes] of Object.entries(ratePatch)) n[k] = { ...(n[k] || {}), ...sizes }; return n; } });
  send(res, 200, { ...data.marketRates, packConfigMirror });
});

addRoute('PUT', '/api/admin/bom-template/:systemType', async (req, res, params) => {
  if (!isAdmin(req)) return send(res, 401, { error: 'Unauthorized' });
  const data = readData();
  if (!data.bomTemplates[params.systemType]) return send(res, 404, { error: 'System type not found' });
  const body = await parseBody(req);
  const { at: _at, ...templatePatch } = body;
  data.bomTemplates[params.systemType] = { ...data.bomTemplates[params.systemType], ...templatePatch };
  writeData(data);
  const packConfigMirror = packConfig.mirrorLegacyWrite({ actor: actorOf(req), section: 'bomTemplates', at: _at, patch: (cur) => ({ ...cur, [params.systemType]: { ...(cur[params.systemType] || {}), ...templatePatch } }) });
  send(res, 200, { ...data.bomTemplates[params.systemType], packConfigMirror });
});

addRoute('GET', '/api/admin/export', async (req, res) => {
  if (!isAdmin(req)) return send(res, 401, { error: 'Unauthorized' });
  const data = readData();
  const json = JSON.stringify(data, null, 2);
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Content-Disposition': `attachment; filename=golden_ray_bom_export_${new Date().toISOString().slice(0,10)}.json`,
    'Access-Control-Allow-Origin': '*'
  });
  res.end(json);
});

// --- BOM State Save/Load (persists selections, overrides, custom items) ---
addRoute('GET', '/api/admin/bom-state', async (req, res) => {
  if (!isAdmin(req)) return send(res, 401, { error: 'Unauthorized' });
  send(res, 200, readBomState());
});

addRoute('PUT', '/api/admin/bom-state', async (req, res) => {
  if (!isAdmin(req)) return send(res, 401, { error: 'Unauthorized' });
  const body = await parseBody(req);
  const state = readBomState();
  const updated = { ...state, ...body, savedAt: new Date().toISOString() };
  writeBomState(updated);
  send(res, 200, { success: true, savedAt: updated.savedAt });
});

addRoute('POST', '/api/admin/import', async (req, res) => {
  if (!isAdmin(req)) return send(res, 401, { error: 'Unauthorized' });
  const importData = await parseBody(req);
  if (!importData.categories || !importData.bomTemplates) return send(res, 400, { error: 'Invalid import data' });
  writeData(importData);
  send(res, 200, { success: true, message: 'Data imported successfully' });
});

// --- Migration: ensure all panels have panelType ---
addRoute('POST', '/api/admin/migrate-panel-types', async (req, res) => {
  if (!isAdmin(req)) return send(res, 401, { error: 'Unauthorized' });
  const data = readData();
  const panels = data.categories?.panel?.items || [];
  let migrated = 0;
  for (const panel of panels) {
    if (!panel.panelType) {
      panel.panelType = panel.dcr ? 'DCR' : 'NON_DCR';
      migrated++;
    }
  }
  if (migrated > 0) writeData(data);
  send(res, 200, { success: true, migrated });
});

// ===== USER AUTH ROUTES =====
// Registers /api/auth/login, /api/auth/logout, /api/auth/session,
// legacy /api/auth, and /api/admin/users/* endpoints.
userAuth.init({ addRoute });

// ===== PROJECT HEAD WORKSPACE (Phase 3) =====
// Additive only: registers /api/workspace/* routes. Nothing above is modified.
const workspace = require('./server-workspace.js');
workspace.register(addRoute, { send, parseBody, isAdmin, isAuthenticated, actorOf });

// ===== COMPANY PROFILE (Phase: Company Master) =====
// Additive: registers /api/admin/company-profile and /api/sales/company-profile.
// Admin can read+write; sales can read-only. Nothing above is modified.
const company = require('./server-company.js');
company.register(addRoute, { send, parseBody, isAdmin, isAuthenticated, actorOf });

// ===== PACKAGE APPROVAL (Master Plan — Step 2) =====
// Additive: registers /api/packages/* routes for package approval lifecycle.
const packageApproval = require('./server-package-approval.js');
packageApproval.register(addRoute, { send, parseBody, isAdmin, isAuthenticated, actorOf, onPackageChange: () => workspace.rebuildEnv() });

// ===== SALES LAYER (Phase 1) =====
// Additive: registers /api/sales/* routes. Customer CRUD, quotation numbers,
// quotation history, system options. Nothing above is modified.
const sales = require('./server-sales.js');
sales.register(addRoute, { send, parseBody, isAdmin, isAuthenticated, actorOf });

// ===== SALES ORCHESTRATOR (Master Plan — Step 5) =====
// Additive: registers /api/sales/orchestrate and /api/sales/preflight routes.
// Delegates to salesOrchestrator.js service layer. Nothing above is modified.
const salesOrchestrator = require('./server-sales-orchestrator.js');
salesOrchestrator.register(addRoute, { send, parseBody, isAdmin, isAuthenticated, actorOf });

// 2026-09-08 fast-quotation build — Project Head pack configuration (draft /
// approved, Admin-approved) + publish of approved packs into the registry.
const packConfig = require('./server-pack-config.js');
const packPublish = require('./server-pack-publish.js');
const bomBuilderForPacks = require('./server-bom-builder.js');
packConfig.register(addRoute, { send, parseBody, isAuthenticated, actorOf });

// 2026-09-13 P1 — editable bilingual quotation content (terms, timeline, scope,
// documents, appliance profiles) for pages 3 / 8 / 9 / 10 / 11. Published
// content is snapshotted into every new quotation by the orchestrator.
const quotationContent = require('./server-content.js');
quotationContent.register(addRoute, { send, parseBody, isAuthenticated, actorOf });

// ===== HTTP SERVER =====

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,PATCH,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Actor-Role,X-Actor-User'
    });
    return res.end();
  }

  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  const urlPath = parsedUrl.pathname;

  // API routes
  if (urlPath.startsWith('/api/')) {
    try {
      const match = matchRoute(req.method, urlPath);
      if (match) {
        const [handler, params] = match;
        await handler(req, res, params, parsedUrl.searchParams);
      } else {
        send(res, 404, { error: 'API route not found' });
      }
    } catch (err) {
      console.error(`[${req.method} ${urlPath}]`, err.message || err);
      send(res, 500, { error: err.message || 'Internal server error' });
    }
    return;
  }

  // Root → unified login page
  if (urlPath === '/') {
    const loginPath = path.join(__dirname, 'public', 'login.html');
    if (fs.existsSync(loginPath)) { sendFile(res, loginPath, req); return; }
  }

  // Static files from dist/
  let filePath = path.join(DIST_DIR, urlPath);
  // Security: prevent path traversal
  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(403); return res.end('Forbidden');
  }

  // Also check public/ for standalone HTML pages not yet built into dist/
  const publicPath = path.join(__dirname, 'public', urlPath);
  const publicSafe = publicPath.startsWith(path.join(__dirname, 'public'));

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    sendFile(res, filePath, req);
  } else if (publicSafe && fs.existsSync(publicPath) && fs.statSync(publicPath).isFile()) {
    sendFile(res, publicPath, req);
  } else if (urlPath.startsWith('/assets/')) {
    // Don't SPA-fallback asset requests — return 404 so stale cached references break cleanly
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Asset not found');
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
});

// The workspace engines are ES modules; load them before accepting traffic so a
// request can never hit a half-initialised service layer.
workspace.init().then(async () => {
  OL = await import('./src/lib/offerLifecycle.js');
  company.init();
  sales.init();
  await quotationContent.init();
  await packageApproval.init();
  await salesOrchestrator.init({
    getWorkspaceStore: workspace.getStore,
    getWorkspaceEnv: workspace.getEnv,
    persistWorkspace: workspace.persist,
    getQuotationStore: workspace.getQuotationStore,
    persistQuotation: workspace.persistQuotation,
    getCompanyProfile: () => company.getQuotationCompanyProfile(),
    // 2026-09-10: the Sales path never received the CMS store, so the ACTIVE
    // offer campaign (quotation page 2) was silently omitted from every
    // Sales-generated quotation. Same provider the internal route uses.
    getCmsStore: () => workspace.getCmsStore(),
    // 2026-09-13 P1: published quotation content (EN/ML) frozen into each issue.
    getQuotationContent: () => ({ version: quotationContent.getPublishedVersion(), content: quotationContent.getPublishedContent() }),
  });
  // Pack config: seeded from the catalog on first boot; the BOM builder reads
  // templates / structure / costs / matrices / market rates from it.
  await packPublish.init();
  await packConfig.init({
    onApproved: async ({ actor, at, version }) => {
      const report = await packPublish.publishApprovedPacks({ actor, at, env: workspace.getEnv(), config: packConfig.getConfig('approved'), configVersion: version });
      workspace.rebuildEnv();
      return report;
    },
  });
  bomBuilderForPacks.setPackConfigProvider(packConfig.getConfig);
  await userAuth.ensureAdminExists();
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Flarize Platform running on http://localhost:${PORT}`);
    console.log(`Data file: ${DATA_FILE}`);
    console.log('Login: /  (→ /login.html)');
    console.log('Admin Dashboard: /admin-dashboard.html');
    console.log('Project Head Workspace: /workspace.html');
    console.log('Procurement Workspace: /procurement.html');
    console.log('Sales Wizard: /sales.html');
    console.log('No npm install needed — zero dependencies!');
  });
}).catch(err => {
  console.error('FATAL: workspace layer failed to initialise:', err.message);
  process.exit(1);
});
