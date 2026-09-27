/**
 * Project Head — BOM Configuration Workspace
 *
 * Purpose: one professional page where the Project Head selects a
 * (systemType, size, phase, tier) [+ optional hybrid battery quantity]
 * combo, sees the complete BOM grouped by category, edits permitted
 * quantities/components, and drives the DRAFT → SUBMITTED → APPROVED
 * lifecycle. The BOM engine and RBAC are ALL server-side — this file
 * only renders what the server returns and stages actions.
 *
 * Routes used (all documented, existing):
 *   GET  /api/sales/system-options
 *   GET  /api/sales/tier-display-names
 *   GET  /api/sales/component-alternatives?systemType=&size=&phase=
 *   GET  /api/packages?systemType=&size=&phase=&tier=&packageState=
 *   GET  /api/packages/:id
 *   GET  /api/packages/approval-summary
 *   POST /api/sales/bom-preview            (BOM resolution / SALES-safe)
 *   PATCH /api/packages/:id                { patch: { components } }
 *   POST /api/packages/:id/run-checker
 *   POST /api/packages/:id/submit
 *   POST /api/packages/:id/approve
 *   POST /api/packages/:id/reject          { reason }
 *   POST /api/packages/:id/reset
 *   POST /api/packages/:id/revision
 *   POST /api/packages/:id/duplicate
 *
 * Sales roles are redirected out on load — Sales uses sales.html.
 */
'use strict';

const SESSION_KEY = 'gr_session_token';
const ROLE_KEY = 'gr_user_role';
const USER_KEY = 'gr_user_name';

const $ = (s, r = document) => r.querySelector(s);
const el = (t, a = {}, ...kids) => {
  const n = document.createElement(t);
  for (const [k, v] of Object.entries(a)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v === false || v == null) {}
    else if (v === true) n.setAttribute(k, '');
    else n.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null) n.append(k.nodeType ? k : document.createTextNode(String(k)));
  return n;
};
const inr = n => n == null ? '—' : '₹' + Math.round(n).toLocaleString('en-IN');

const S = {
  role: '',
  userId: '',
  systemType: 'ongrid',
  systemOptions: null,
  tierNames: { base: 'Essential', value: 'Smart', premium: 'Elite' },
  size: null,
  phase: null,
  tier: 'base',
  batteryQty: 1,
  pkg: null,
  bom: null,               // resolved BOM lines (grouped by category)
  pending: {},             // role -> { quantity, reason, source: original }
  addonAdds: [],           // {role, componentId, quantity} — staged additions
  removes: [],             // roles the user staged to remove
  alternatives: {},
  approvalSummary: null,
};

const CAN = {
  edit: r => r === 'PROJECT_HEAD' || r === 'ADMIN',
  approve: r => r === 'ADMIN',
  cost: r => r !== 'SALES' && r !== 'SALES_HEAD' && r !== 'SALES_CRS' && r !== 'FIELD_SALES',
};

function getToken() { try { return sessionStorage.getItem(SESSION_KEY) || ''; } catch { return ''; } }
function authHeaders(extra = {}) { return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken(), ...extra }; }

async function api(method, url, body) {
  const opts = { method, headers: authHeaders() };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }
  if (!r.ok) throw Object.assign(new Error(data?.error || data?.message || r.statusText), { status: r.status, code: data?.code, body: data });
  return data;
}

function toast(message, kind = '') {
  const t = $('#toast'); t.textContent = message; t.className = `toast ${kind}`; t.style.display = 'block';
  clearTimeout(t._h); t._h = setTimeout(() => t.style.display = 'none', 4500);
}

function requireAuth() {
  const token = getToken();
  const role = sessionStorage.getItem(ROLE_KEY) || '';
  if (!token) { location.href = '/login.html?next=' + encodeURIComponent(location.pathname); return false; }
  if (role === 'SALES' || role === 'SALES_HEAD' || role === 'SALES_CRS' || role === 'FIELD_SALES') {
    location.replace('/sales.html'); return false;
  }
  S.role = role;
  S.userId = sessionStorage.getItem(USER_KEY) || '';
  return true;
}

// -------- boot --------
async function boot() {
  if (!requireAuth()) return;
  // Server-asserted identity: the session role decides the workspace, not the
  // value a client stored. Sales roles are sent to their own flow; the server
  // enforces RBAC on every API call regardless of this redirect.
  try {
    const me = await api('GET', '/api/auth/session');
    const role = me?.user?.role || me?.role || '';
    if (role) {
      S.role = role; try { sessionStorage.setItem(ROLE_KEY, role); } catch {}
      if (['SALES', 'SALES_HEAD', 'SALES_CRS', 'FIELD_SALES'].includes(role)) { location.replace('/sales.html'); return; }
    }
  } catch (e) {
    if (e && (e.status === 401 || e.code === 'UNAUTHENTICATED')) { location.href = '/login.html?next=' + encodeURIComponent(location.pathname); return; }
  }
  applyRoleUi();
  try {
    S.systemOptions = await api('GET', '/api/sales/system-options');
    try { const t = await api('GET', '/api/sales/tier-display-names'); if (t && typeof t === 'object') S.tierNames = t.displayNames || t; } catch {}
    if (!S.systemType) { const t0 = typesList()[0]; if (t0) S.systemType = t0.key; }
    if (!S.size) {
      const first = sizesForType()[0];
      if (first) { S.size = first.size ?? first.key ?? first; S.phase = first.phase || null; }
    }
    renderConfig();
    await loadPackage();
    refreshApprovalSummary();
  } catch (e) { toast('Failed to load workspace: ' + e.message, 'bad'); }
}

function applyRoleUi() {
  $('#avatar').textContent = S.role === 'PROJECT_HEAD' ? 'PH' : S.role.slice(0, 2);
  const roleSel = $('#roleSel'); if (roleSel) roleSel.value = S.role;
  const sub = $('#roleSub'); if (sub) sub.textContent = { PROJECT_HEAD: 'Author · Save · Submit', ADMIN: 'Approve · Reject · Publish', ENGINEERING: 'Technical review · read-only' }[S.role] || S.role;
  const ro = $('#ro');
  if (!CAN.edit(S.role)) {
    ro.style.display = 'block';
    ro.textContent = S.role === 'ENGINEERING'
      ? 'Engineering view — technical review only. Approval belongs to Admin; authoring to Project Head.'
      : 'Read-only view for your role.';
  } else ro.style.display = 'none';
  document.querySelectorAll('.cost').forEach(n => n.style.display = CAN.cost(S.role) ? '' : 'none');
  $('#addWrap').style.display = CAN.edit(S.role) ? '' : 'none';
  $('#btnSave').disabled = !CAN.edit(S.role);
  $('#btnSubmit').disabled = !CAN.edit(S.role);
  $('#btnApprove').disabled = !CAN.approve(S.role);
  $('#btnRevise').disabled = !CAN.edit(S.role);
  $('#approveHint').textContent = CAN.approve(S.role)
    ? 'Publishes a new BOM version and supersedes the prior APPROVED revision for this combo (server-enforced).'
    : 'ADMIN only. Project Head cannot approve own package.';
  $('#addonAdd').disabled = !CAN.edit(S.role);
  $('#swFR').disabled = !CAN.edit(S.role);
}

// -------- system options → chips/segments ---------
// /api/sales/system-options (server-sales.js) returns
//   { options: { [sysType]: { label, sizes:[{key,label,phase,isThreePhase}], tiers } }, profiles, siteOptions }
// An older fixture shape ({ systemTypes:[{value,label,tiers,sizes}] }) is still read if present.
function typesList() {
  const so = S.systemOptions || {};
  if (so.options && typeof so.options === 'object') {
    return Object.entries(so.options).map(([key, t]) => ({
      key, label: t.label || key, tiers: t.tiers,
      sizes: (t.sizes || []).map(sz => ({ key: sz.key, size: sz.key, label: sz.label || `${sz.key} kW`, phase: sz.phase || (sz.isThreePhase ? '3P' : '1P'), disabled: sz.disabled })),
    }));
  }
  return (so.systemTypes || []).map(t => ({ key: t.value, label: t.label, tiers: t.tiers, sizes: t.sizes }));
}
function sizesForType() { const t = typesList().find(x => x.key === S.systemType); return t ? (t.sizes || []).filter(s => !s.disabled) : []; }
function tiersForType() { const t = typesList().find(x => x.key === S.systemType); return (t?.tiers || ['base', 'value', 'premium']).map(k => ({ key: k, label: k.charAt(0).toUpperCase() + k.slice(1), display: S.tierNames[k] || k })); }

function renderConfig() {
  const types = typesList();
  $('#segType').replaceChildren(...types.map(t => el('button', {
    class: t.key === S.systemType ? 'on' : '',
    onclick: () => { S.systemType = t.key; S.size = null; S.phase = null; S.pending = {}; S.addonAdds = []; S.removes = []; const first = sizesForType()[0]; if (first) { S.size = first.size ?? first.key; S.phase = first.phase; } renderConfig(); loadPackage(); }
  }, t.label)));

  $('#chipsSize').replaceChildren(...sizesForType().map(s => el('button', {
    class: 'chip' + ((s.size ?? s.key) === S.size && (!s.phase || s.phase === S.phase) ? ' on' : ''),
    onclick: () => { S.size = s.size ?? s.key; S.phase = s.phase || null; S.pending = {}; S.addonAdds = []; S.removes = []; renderConfig(); loadPackage(); }
  }, s.label || `${s.size} kW`, el('small', {}, s.phase || ''))));

  $('#segTier').replaceChildren(...tiersForType().map(t => el('button', {
    class: t.key === S.tier ? 'on' : '',
    onclick: () => { S.tier = t.key; S.pending = {}; S.addonAdds = []; S.removes = []; renderConfig(); loadPackage(); }
  }, t.label)));
  const t = tiersForType().find(x => x.key === S.tier);
  $('#tierSub').textContent = `Customer-facing: ${t?.display || t?.label} · internal key ${t?.key || ''}`;

  const isHybrid = S.systemType === 'hybrid';
  $('#batWrap').hidden = !isHybrid;
  if (isHybrid) {
    $('#segBat').replaceChildren(...[0, 1, 2].map(q => el('button', {
      class: q === S.batteryQty ? 'on' : '',
      disabled: !CAN.edit(S.role),
      onclick: () => { S.batteryQty = q; loadBom(); }
    }, String(q))));
    $('#batNote').textContent = 'Model comes from the approved package template. Quantity is a project configuration (0/1/2). Protection resolves from battery-master engineering data — will BLOCK when unresolved.';
  }
}

// -------- package + BOM load --------
async function loadPackage() {
  try {
    const list = await api('GET', `/api/packages?systemType=${encodeURIComponent(S.systemType)}&size=${encodeURIComponent(S.size)}${S.phase ? `&phase=${encodeURIComponent(S.phase)}` : ''}&tier=${encodeURIComponent(S.tier)}`);
    const rows = Array.isArray(list?.packages) ? list.packages : (Array.isArray(list) ? list : []);
    // Working record for the combo: an open DRAFT / SUBMITTED revision first (that is
    // what PH is editing), else the current APPROVED (non-superseded) revision.
    // ARCHIVED and superseded records are history, never the working record.
    const live = rows.filter(p => !p.supersededBy && p.packageState !== 'ARCHIVED');
    const byRev = (a, b) => (b.revisionNumber || 1) - (a.revisionNumber || 1);
    const current = live.filter(p => p.packageState === 'DRAFT' || p.packageState === 'SUBMITTED').sort(byRev)[0]
      || live.filter(p => p.packageState === 'APPROVED' || p.approvalStatus === 'APPROVED').sort(byRev)[0]
      || live.sort(byRev)[0];
    if (!current) {
      S.pkg = null; S.bom = null;
      $('#bomBody').replaceChildren(el('tr', {}, el('td', { colspan: 12 }, 'No package exists for this configuration. Ask Admin to create one via /api/packages.')));
      renderHeader(); renderSummary(); return;
    }
    S.pkg = await api('GET', `/api/packages/${encodeURIComponent(current.packageId)}`);
    try {
      const alts = await api('GET', `/api/sales/component-alternatives?systemType=${encodeURIComponent(S.systemType)}&size=${encodeURIComponent(S.size)}${S.phase ? `&phase=${encodeURIComponent(S.phase)}` : ''}&tier=${encodeURIComponent(S.tier)}`);
      S.alternatives = alts?.alternatives || alts || {};
    } catch { S.alternatives = {}; }
    await loadBom();
    renderAlts(); renderAddons(); renderHistoryFromRecord();
  } catch (e) { toast('Load failed: ' + e.message, 'bad'); }
}

/**
 * The table is the AUTHORITATIVE package (registry components) — exactly what
 * projectWorkspace.selectPackage materialises into a production BOM and what
 * the engineering checker validates. The legacy template preview
 * (/api/sales/bom-preview) is fetched only to decorate rows (name / brand /
 * unit / catalog REFERENCE price) and is shown as a reference count, never as
 * the BOM: it contains template consumables that are NOT in the package.
 */
let CATALOG_INDEX = null;
async function catalogIndex() {
  if (CATALOG_INDEX) return CATALOG_INDEX;
  const cat = await api('GET', '/api/catalog');
  const idx = {};
  for (const [key, c] of Object.entries(cat?.categories || {})) for (const it of c.items || []) idx[it.id] = { ...it, category: key, unit: it.unit || c.unit || 'nos' };
  CATALOG_INDEX = idx; return idx;
}

async function loadBom() {
  try {
    const idx = await catalogIndex().catch(() => ({}));
    let preview = null;
    try {
      const body = { systemType: S.systemType, size: S.size, phase: S.phase || undefined, tierSelections: { [S.tier]: {} } };
      if (S.systemType === 'hybrid') body.batteryQuantity = S.batteryQty;
      const res = await api('POST', '/api/sales/bom-preview', body);
      preview = res?.boms?.[S.tier] || null;
    } catch { preview = null; }
    const previewById = {}; for (const l of (preview?.lines || [])) previewById[l.componentId || l.catalogItemId] = l;
    const comps = Array.isArray(S.pkg?.components) ? S.pkg.components : [];
    const lines = comps.map(c => {
      const it = idx[c.componentId] || {}; const pv = previewById[c.componentId] || {};
      return {
        role: c.role, componentId: c.componentId, quantity: c.quantity ?? null,
        category: it.category || c.role, name: it.name || pv.name || c.componentId, brand: it.brand || pv.brand || null,
        unit: it.unit || pv.unit || 'nos',
        refUnitCost: pv.unitPrice ?? null,            // catalog REFERENCE price via preview — never landed cost
        quantityRule: c.quantityRule || null, qtySource: c.quantityRule || c.selectionMethod || 'PACKAGE_TEMPLATE',
        approvalStatus: c.approvalStatus || it.approvalStatus || null,
        engineeringStatus: (S.pkg?.lastValidation?.findings || []).some(f => (f.componentIds || []).includes(c.componentId) && f.severity === 'BLOCKED') ? 'BLOCKED'
          : (S.pkg?.lastValidation?.findings || []).some(f => (f.componentIds || []).includes(c.componentId)) ? 'WARNING' : (S.pkg?.lastValidation ? 'VALID' : null),
        approvedAlternates: c.approvedAlternates || [],
      };
    });
    S.bom = { lines, source: 'PACKAGE_REGISTRY', previewLineCount: preview?.lines?.length ?? null, engineering: preview?.engineering || null };
  } catch (e) { S.bom = { blocked: true, error: e.message, lines: [] }; }
  renderHeader(); renderTable(); renderValidation(); renderSummary();
}

async function refreshApprovalSummary() {
  try { S.approvalSummary = await api('GET', '/api/packages/approval-summary'); } catch { S.approvalSummary = null; }
}

// -------- rendering --------
const GROUP_ORDER = ['MODULES', 'INVERTER / POWER ELECTRONICS', 'BATTERY', 'PROTECTION', 'STRUCTURE', 'CABLES', 'CONNECTORS', 'EARTHING', 'MONITORING', 'ACCESSORIES', 'SITE ADD-ONS'];
const GROUP_OF = {
  panel: 'MODULES',
  inverter: 'INVERTER / POWER ELECTRONICS', inverter_hybrid: 'INVERTER / POWER ELECTRONICS', micro_inverter: 'INVERTER / POWER ELECTRONICS', microinverter: 'INVERTER / POWER ELECTRONICS', optimizer: 'INVERTER / POWER ELECTRONICS',
  battery: 'BATTERY', battery_protection: 'BATTERY', battery_cable: 'BATTERY', mccb_box: 'BATTERY',
  dcdb: 'PROTECTION', acdb: 'PROTECTION', isolator: 'PROTECTION', change_over: 'PROTECTION', la_cable: 'PROTECTION', la_rod: 'PROTECTION',
  structure_material: 'STRUCTURE', ss_screw: 'STRUCTURE',
  dc_cable: 'CABLES', ac_cable: 'CABLES', ug_cable: 'CABLES', conduit_pipe: 'CABLES', flexible_pipe: 'CABLES', armoured_cable: 'CABLES',
  mc4_connector: 'CONNECTORS', copper_lug: 'CONNECTORS', cable_tie: 'CONNECTORS', insulation_tape: 'CONNECTORS',
  earth_cable: 'EARTHING', cb_rod: 'EARTHING',
  monitoring: 'MONITORING', enphase: 'ACCESSORIES', hoymiles: 'ACCESSORIES', meter: 'ACCESSORIES', meter_box: 'ACCESSORIES',
};

function renderHeader() {
  const p = S.pkg;
  if (!p) { $('#cfgKey').textContent = ''; $('#pillPkg').innerHTML = '<span class="dot"></span> —'; $('#pillEng').innerHTML = '<span class="dot"></span> Engineering Check: —'; return; }
  $('#cfgKey').textContent = `${p.systemType}|${p.size}|${p.phase || '?'}|${p.tier}${S.systemType === 'hybrid' ? ` · BAT×${S.batteryQty}` : ''} · ${p.packageId}`;
  $('#pillPhase').textContent = `${p.phase === '3P' ? 'Three Phase' : p.phase === '1P' ? 'Single Phase' : '—'} · ${p.size} kW`;
  const panelLine = (p.components || []).find(c => c.role === 'panel');
  $('#pillPanels').textContent = panelLine?.quantity != null ? `${panelLine.quantity} panels` : 'panels —';

  const stateCls = { DRAFT: 'mut', SUBMITTED: 'info', APPROVED: 'ok', REJECTED: 'bad', ARCHIVED: 'mut' }[p.packageState] || 'mut';
  $('#pillPkg').className = 'pill ' + stateCls;
  $('#pillPkg').innerHTML = `<span class="dot"></span> ${p.packageState || 'PROPOSED'} · BOM v${p.revisionNumber || 1}${p.supersededBy ? ' (superseded)' : ''}`;

  // Legacy APPROVED records carry engineeringStatus (the pre-V4 approval verdict);
  // a checker result on the current revision always wins. Nothing is implied VALID.
  const lv = p.lastValidation?.status || p.lastValidationStatus
    || (p.blockers && p.blockers.length ? 'BLOCKED' : null)
    || (p.legacyApproved && p.engineeringStatus === 'APPROVED' ? 'LEGACY_APPROVED' : null)
    || (p.engineeringStatus === 'WARNING' ? 'WARNING' : 'NOT_RUN');
  const engCls = { VALID: 'ok', LEGACY_APPROVED: 'ok', WARNING: 'warn', BLOCKED: 'bad' }[lv] || 'mut';
  $('#pillEng').className = 'pill ' + engCls;
  $('#pillEng').innerHTML = `<span class="dot"></span> Engineering Check: ${lv === 'VALID' ? 'Passed' : lv === 'LEGACY_APPROVED' ? 'Legacy approval (re-run on revision)' : lv.replace(/_/g, ' ')}`;
}

function renderAlts() {
  const box = $('#alts'); box.replaceChildren();
  const alts = S.alternatives || {};
  const rolesShown = ['panel', 'inverter', 'inverter_hybrid', 'micro_inverter', 'structure_material'];
  let n = 0;
  for (const role of rolesShown) {
    const list = alts[role] || alts[role.toUpperCase()];
    if (!Array.isArray(list) || !list.length) continue;
    const cmp = (S.pkg?.components || []).find(c => c.role === role);
    if (!cmp) continue;
    n += 1;
    const sel = el('select', {
      disabled: !CAN.edit(S.role) || list.length < 2 || S.pkg.packageState !== 'DRAFT',
      onchange: e => stageComponentSwap(role, e.target.value),
    }, ...list.map(a => {
      const id = a.componentId || a.id || a; const name = a.componentName || a.name || (a.brand ? `${a.brand} ${a.model || ''}`.trim() : id);
      return el('option', { value: id, selected: id === cmp.componentId }, name);
    }));
    box.append(el('div', { class: 'alt' }, el('span', {}, role.replace(/_/g, ' ').toUpperCase()), sel));
  }
  if (!n) box.append(el('div', { class: 'hint' }, 'No approved alternates surfaced for this package.'));
}

function renderAddons() {
  const box = $('#addons'); box.replaceChildren();
  if (!S.addonAdds.length) box.append(el('div', { class: 'hint' }, 'No staged site add-ons. Add-ons attach to the project, never to the standard template.'));
  S.addonAdds.forEach((a, i) => box.append(el('div', { class: 'addon' },
    el('span', { style: 'flex:1' }, `${a.role.replace(/_/g, ' ')} × ${a.quantity}`),
    CAN.edit(S.role) ? el('button', { class: 'ic danger', title: 'Remove', onclick: () => { S.addonAdds.splice(i, 1); renderAddons(); renderTable(); renderSummary(); } }, '×') : null,
  )));
}

function renderValidation() {
  const p = S.pkg;
  if (!p) { $('#valPill').innerHTML = '<span class="dot"></span> —'; $('#valBody').replaceChildren(); return; }
  // Status is what the checker recorded on THIS revision. Package-level blockers
  // force BLOCKED; with no checker run the status is NOT_RUN — never an implied VALID.
  const status = p.lastValidation?.status || (p.blockers && p.blockers.length ? 'BLOCKED' : 'NOT_RUN');
  const cls = { VALID: 'ok', WARNING: 'warn', BLOCKED: 'bad' }[status] || 'mut';
  $('#valPill').className = 'pill ' + cls;
  $('#valPill').innerHTML = `<span class="dot"></span> ${status}`;
  const at = p.lastValidation?.checkedAt || p.lastValidation?.at;
  const nf = (p.lastValidation?.findings || []).length;
  $('#valMeta').textContent = `${(p.blockers || []).length} package blocker${(p.blockers || []).length === 1 ? '' : 's'}${nf ? ` · ${nf} checker finding${nf === 1 ? '' : 's'}` : ''}${p.lastValidation?.architecture ? ` · ${p.lastValidation.architecture}` : ''}${at ? ' · ' + new Date(at).toLocaleTimeString() : ''}`;

  const findings = [];
  // Engineering checker output (POST /api/packages/:id/run-checker → pkg.lastValidation)
  for (const f of p.lastValidation?.findings || []) findings.push({ severity: f.severity || 'WARNING', what: `${(f.componentIds || []).join(', ') || f.category || 'BOM'} — ${f.message || f.ruleId}`, why: f.reason || '', rule: f.ruleId || '', owner: /^PBC-(H|M)/.test(f.ruleId || '') ? 'ENGINEERING' : 'PROJECT_HEAD' });
  for (const b of p.blockers || []) findings.push({ severity: 'BLOCKED', what: b.what || b.message || b.code || 'Package blocker', why: b.why || b.detail || '', rule: b.code || b.rule || '', owner: b.owner || b.role || 'ENGINEERING' });
  if (S.bom?.error) findings.push({ severity: 'BLOCKED', what: 'BOM resolution failed', why: S.bom.error, rule: 'server-bom-builder', owner: 'ENGINEERING' });
  for (const l of (S.bom?.lines || [])) {
    for (const b of (l.blockers || l.findings || [])) findings.push({ severity: b.severity || 'BLOCKED', what: b.what || `${l.role} — ${b.code || 'issue'}`, why: b.why || b.message || '', rule: b.code || b.rule || '', owner: b.owner || 'ENGINEERING' });
  }

  const body = $('#valBody'); body.replaceChildren();
  if (!findings.length && status === 'NOT_RUN') return body.append(el('div', { class: 'hint' }, 'Engineering validation has not been run on this revision. Run it before submitting — submit and approve refuse an unvalidated or stale revision.'));
  if (!findings.length) return body.append(el('div', { class: 'hint' }, 'All required engineering rules and components resolve. BOM can be submitted.'));
  const order = { BLOCKED: 0, WARNING: 1, INFO: 2 };
  body.append(el('table', {}, el('thead', {}, el('tr', {}, ...['', 'WHAT', 'WHY', 'RULE', 'RESPONSIBLE'].map(h => el('th', {}, h)))), el('tbody', {}, ...findings.slice().sort((a, b) => (order[a.severity] || 9) - (order[b.severity] || 9)).map(f => el('tr', {},
    el('td', {}, el('span', { class: `sev ${f.severity}` }, f.severity)),
    el('td', {}, el('b', {}, f.what)),
    el('td', {}, f.why),
    el('td', {}, el('span', { class: 'rule' }, `${f.code || f.rule || ''}`)),
    el('td', {}, el('b', {}, f.owner)),
  )))));
}

function bomLinesGrouped() {
  const bom = S.bom; if (!bom || !Array.isArray(bom.lines)) return { groups: [], rows: [] };
  const withGroup = bom.lines.map((l, i) => {
    const cat = l.category || (l.componentId || '').split('_')[0] || l.role || 'ACCESSORIES';
    const group = GROUP_OF[cat] || 'ACCESSORIES';
    // /api/sales/bom-preview lines: { category, componentId, qty, unitPrice (catalog
    // REFERENCE price — never landed cost), amount, selectionMethod }. Normalise to the
    // field names this table uses; role = registry component role (= category).
    return {
      ...l,
      role: l.role ?? l.category,
      quantity: l.quantity ?? l.qty ?? null,
      unit: l.unit || 'nos',
      refUnitCost: l.refUnitCost ?? l.unitPrice ?? null,
      qtySource: l.qtySource ?? l.selectionMethod ?? null,
      lineNo: i + 1, group,
    };
  });
  for (const a of S.addonAdds) withGroup.push({ role: a.role, componentId: a.componentId, quantity: a.quantity, category: 'site_addon', group: 'SITE ADD-ONS', unit: a.unit || 'nos', quantityRule: 'project-specific', qtySource: 'PROJECT_ADDON', editable: true, removable: true, mandatory: false, engineeringStatus: 'VALID', approvalStatus: 'APPROVED', refUnitCost: null, refTotal: null, isAddon: true, lineNo: withGroup.length + 1 });
  withGroup.sort((a, b) => (GROUP_ORDER.indexOf(a.group)) - (GROUP_ORDER.indexOf(b.group)) || a.lineNo - b.lineNo);
  withGroup.forEach((l, i) => l.lineNo = i + 1);
  const groups = GROUP_ORDER.filter(g => withGroup.some(l => l.group === g));
  return { groups, rows: withGroup };
}

function renderTable() {
  const canEdit = CAN.edit(S.role) && S.pkg?.packageState === 'DRAFT';
  const { groups, rows } = bomLinesGrouped();
  const tb = $('#bomBody'); tb.replaceChildren();
  if (!rows.length) {
    tb.append(el('tr', {}, el('td', { colspan: 12 }, S.bom?.error ? `BOM BLOCKED: ${S.bom.error}` : 'No BOM lines resolved for this configuration.')));
  } else for (const g of groups) {
    const gr = rows.filter(l => l.group === g);
    tb.append(el('tr', { class: 'g' }, el('td', { colspan: 12 }, g, el('small', {}, `${gr.length} line${gr.length === 1 ? '' : 's'}`))));
    for (const l of gr) {
      const pend = S.pending[l.role];
      const q = pend ? pend.quantity : l.quantity;
      const editable = canEdit && (l.editable ?? isRoleQuantityEditable(l.role, l.qtySource || l.quantityRule)) && !l.isAddon;
      const qtyCtl = el('div', { class: 'qty' + (editable ? '' : ' lock'), title: editable ? 'Project Head configurable' : `${(l.qtySource || l.quantityRule || 'engineering-derived').toString().replace(/_/g, ' ')} — not manually editable` },
        editable ? el('button', { onclick: () => setPending(l, Math.max(1, (Number(q) || 0) - (l.unit === 'm' ? 10 : 1))) }, '−') : null,
        el('input', { type: 'number', value: q == null ? '' : q, disabled: !editable, min: '1', oninput: e => setPending(l, Number(e.target.value), true) }),
        editable ? el('button', { onclick: () => setPending(l, (Number(q) || 0) + (l.unit === 'm' ? 10 : 1)) }, '+') : null,
      );
      const srcTag = friendlySource(l);
      const ruleCell = el('td', {}, el('span', { class: `src ${srcTag.cls}` }, srcTag.text), l.allocation ? el('div', { class: 'hint' }, `${l.allocation} = ${l.quantity}`) : el('div', { class: 'hint rule' }, l.quantityRule || l.rule || l.qtySource || ''));
      // Per-line engineering state comes from the checker run on this revision; with
      // no run it is shown as NOT RUN, never an implied VALID.
      const eng = l.engineeringStatus || (l.blockers && l.blockers.length ? 'BLOCKED' : 'NOT_RUN');
      const appr = l.approvalStatus || (l.componentApproved === false ? 'PROPOSED' : 'UNKNOWN');
      tr = el('tr', { class: (eng === 'BLOCKED' ? 'blocked' : '') + (pend ? ' dirty' : '') },
        el('td', { class: 'n' }, l.lineNo),
        el('td', { class: 'item' }, el('b', {}, (l.role || '').replace(/_/g, ' ').toUpperCase()), el('small', {}, l.componentId || '—')),
        el('td', {}, l.category ? String(l.category).replace(/_/g, ' ') : '—'),
        el('td', { class: 'model', title: `${l.componentName || l.name || l.model || ''}` }, l.componentName || l.name || `${l.brand || ''} ${l.model || ''}`.trim() || '—'),
        el('td', { class: 'num' }, qtyCtl, pend ? el('span', { class: 'reason' }, el('input', { type: 'text', placeholder: 'Reason (recorded in audit)', value: pend.reason || '', oninput: e => { S.pending[l.role].reason = e.target.value; } })) : null),
        el('td', {}, l.unit || 'nos'),
        ruleCell,
        el('td', { class: 'num cost', style: CAN.cost(S.role) ? '' : 'display:none' }, inr(l.refUnitCost ?? l.referencePrice ?? l.catalogPrice)),
        el('td', { class: 'num cost', style: CAN.cost(S.role) ? '' : 'display:none' }, inr((l.refUnitCost ?? l.referencePrice ?? l.catalogPrice) != null && q != null ? (l.refUnitCost ?? l.referencePrice ?? l.catalogPrice) * Number(q) : null)),
        el('td', {}, el('span', { class: `st ${eng}` }, el('span', { class: 'dot' }), eng)),
        el('td', {}, el('span', { class: `st ${appr}` }, el('span', { class: 'dot' }), appr)),
        el('td', {}, canEdit ? [
          l.isAddon ? el('button', { class: 'ic danger', title: 'Remove add-on', onclick: () => { S.addonAdds = S.addonAdds.filter(a => a.role !== l.role); renderAddons(); renderTable(); renderSummary(); } }, '×')
            : el('button', { class: 'ic danger', title: l.required ? 'Required by engineering rule — cannot remove' : 'Remove from template', disabled: !!l.required, onclick: () => stageRemove(l) }, '×'),
        ] : el('span', { class: 'hint' }, l.required ? 'required' : '')),
      );
      tb.append(tr);
    }
  }
  const dirty = Object.keys(S.pending).length + S.addonAdds.length + S.removes.length;
  const pvCount = S.bom?.previewLineCount;
  $('#bomMeta').textContent = `${rows.length} package lines · ${groups.length} groups${dirty ? ` · ${dirty} unsaved change${dirty > 1 ? 's' : ''}` : ''}${pvCount != null && pvCount !== rows.length ? ` · legacy template preview: ${pvCount} lines (reference only — not in the approved package)` : ''}`;
  $('#footL').textContent = S.pkg?.packageState === 'DRAFT' ? 'Editing DRAFT. Save Draft PATCHes the components[] array with reason for each edit.' : `Package is ${S.pkg?.packageState || '—'} — create a revision to edit.`;
  $('#footR').textContent = CAN.cost(S.role) ? 'Reference material total from catalog reference — NOT landed cost.' : '';
}
let tr; // hoisted for template literals above

function friendlySource(l) {
  const s = String(l.qtySource || l.quantityRule || '').toLowerCase();
  if (l.isAddon) return { text: 'SITE ADD-ON', cls: 'PROJECT_ADDON' };
  if (/allocat/.test(s) || l.allocation) return { text: 'DEVICE ALLOCATION', cls: 'DEVICE_ALLOCATED' };
  if (/ceil|derive|watt|per_panel|per panel/.test(s)) return { text: 'DERIVED FROM CONFIG', cls: 'DERIVED_FROM_CONFIG' };
  if (/engineer|protection|rule/.test(s)) return { text: 'ENGINEERING RULE', cls: 'ENGINEERING_RULE' };
  if (/fixed:/.test(s)) return { text: 'FIXED', cls: 'FIXED' };
  return { text: 'PROJECT HEAD CONFIGURED', cls: 'PH_CONFIGURED' };
}

function isRoleQuantityEditable(role, source) {
  // engineering-derived roles are locked; PH may only edit CONFIGURED slots
  const locked = /panel|inverter|micro_inverter|microinverter|optimizer|battery|battery_protection|mccb_box|structure_fasteners/i.test(role);
  const src = String(source || '').toLowerCase();
  if (locked) return false;
  if (/allocat|ceil|derive|per_panel/.test(src)) return false;
  return true;
}

function stageComponentSwap(role, componentId) {
  if (!S.pkg || S.pkg.packageState !== 'DRAFT') { toast('Package must be DRAFT to swap components — create a revision first.', 'bad'); return; }
  const comps = S.pkg.components.map(c => ({ ...c }));
  const target = comps.find(c => c.role === role); if (!target) return;
  target.componentId = componentId;
  patchComponents(comps, `Component swap on ${role}: ${componentId}`);
}

function stageRemove(l) {
  const reason = prompt(`Remove ${l.role.replace(/_/g, ' ')} from template? Reason:`);
  if (reason == null) return;
  const comps = S.pkg.components.filter(c => c.role !== l.role);
  patchComponents(comps, `Remove ${l.role} — ${reason}`);
}

async function patchComponents(components, note) {
  try {
    await api('PATCH', `/api/packages/${encodeURIComponent(S.pkg.packageId)}`, { patch: { components }, at: new Date().toISOString(), note });
    toast('Saved', 'ok');
    S.pending = {}; S.addonAdds = []; S.removes = [];
    await loadPackage();
  } catch (e) { toast(`${e.code || 'ERROR'}: ${e.message}`, 'bad'); }
}

function setPending(l, qty, typing = false) {
  if (!Number.isFinite(qty) || qty <= 0) { if (!typing) toast('Quantity must be > 0', 'bad'); return; }
  if (qty === l.quantity) delete S.pending[l.role];
  else S.pending[l.role] = { quantity: qty, reason: S.pending[l.role]?.reason || '' };
  renderTable(); renderSummary();
}

function renderSummary() {
  const p = S.pkg, b = S.bom;
  const blockedLines = b?.lines?.filter(x => (x.engineeringStatus === 'BLOCKED' || (x.blockers && x.blockers.length))).length || 0;
  const rows = [
    ['Configuration', p ? `${S.systemType} · ${S.size} kW${S.phase ? ' ' + S.phase : ''} · ${S.tier}${S.systemType === 'hybrid' ? ` · Battery ×${S.batteryQty}` : ''}` : '—'],
    ['Package', p?.packageId || '—'],
    ['State / version', p ? `${p.packageState || 'PROPOSED'} · v${p.revisionNumber || 1}` : '—'],
    ['Lines', b?.lines?.length || 0],
    ['Blocked lines', blockedLines],
    ['Unsaved changes', Object.keys(S.pending).length + S.addonAdds.length + S.removes.length],
  ];
  if (S.approvalSummary) rows.push(['Approvals', Object.entries(S.approvalSummary).map(([k, v]) => `${k}:${v}`).join(' · ')]);
  $('#sum').replaceChildren(...rows.flatMap(([k, v]) => [el('span', {}, k), el('b', {}, String(v))]));

  const eng = p?.lastValidation?.status || (p?.blockers?.length ? 'BLOCKED' : 'NOT_RUN');
  $('#btnSave').disabled = !CAN.edit(S.role) || p?.packageState !== 'DRAFT' || (Object.keys(S.pending).length === 0 && S.addonAdds.length === 0);
  $('#btnSubmit').disabled = !CAN.edit(S.role) || p?.packageState !== 'DRAFT' || Object.keys(S.pending).length > 0 || eng === 'BLOCKED';
  $('#btnApprove').disabled = !CAN.approve(S.role) || p?.packageState !== 'SUBMITTED';
  $('#btnRevise').disabled = !CAN.edit(S.role) || !p || (p.packageState !== 'APPROVED' && p.packageState !== 'REJECTED');
}

function renderHistoryFromRecord() {
  const p = S.pkg;
  const rows = [];
  if (p?.approvedBy) rows.push({ at: p.approvedAt, action: 'APPROVE', user: p.approvedBy, detail: `BOM v${p.revisionNumber || 1} published` });
  if (p?.submittedBy) rows.push({ at: p.submittedAt, action: 'SUBMIT', user: p.submittedBy, detail: '' });
  if (p?.previousRevisionId) rows.push({ at: p.createdAt, action: 'REVISION', user: p.createdBy || '', detail: `from ${p.previousRevisionId}` });
  if (p?.createdBy) rows.push({ at: p.createdAt, action: 'CREATE', user: p.createdBy, detail: '' });
  if (p?.rejectionReason) rows.unshift({ at: p.rejectedAt || p.approvedAt, action: 'REJECT', user: p.rejectedBy || '', detail: p.rejectionReason });
  $('#histMeta').textContent = `${rows.length} entries (from record — no separate history endpoint)`;
  $('#hist').replaceChildren(...rows.map(h => el('div', {},
    el('b', {}, h.action),
    el('small', {}, `${h.user} · ${h.at ? new Date(h.at).toLocaleString() : ''}${h.detail ? ' · ' + h.detail : ''}`)
  )));
}

// -------- action buttons --------
async function saveDraft() {
  if (!S.pkg || S.pkg.packageState !== 'DRAFT') return toast('Only DRAFT packages can be saved.', 'bad');
  const comps = S.pkg.components.map(c => ({ ...c }));
  const missing = [];
  for (const [role, pend] of Object.entries(S.pending)) {
    if (!pend.reason || !pend.reason.trim()) missing.push(role);
    const tgt = comps.find(c => c.role === role); if (tgt) tgt.quantity = pend.quantity;
  }
  if (missing.length) return toast(`Reason required for: ${missing.map(r => r.replace(/_/g, ' ')).join(', ')}`, 'bad');
  await patchComponents(comps, 'Draft save from PH BOM workspace');
}

async function runCheck() {
  if (!S.pkg) return;
  try {
    const r = await api('POST', `/api/packages/${encodeURIComponent(S.pkg.packageId)}/run-checker`, { at: new Date().toISOString() });
    const status = r?.status || r?.validation?.status || 'run';
    const n = Array.isArray(r?.findings) ? r.findings.length : null;
    toast(`Engineering check: ${status}${n != null ? ` · ${n} finding${n === 1 ? '' : 's'}` : ''}${r?.architecture ? ` · ${r.architecture}` : ''}`, status === 'BLOCKED' ? 'bad' : 'ok');
    await loadPackage();
  } catch (e) { toast(`${e.code || 'ERROR'}: ${e.message}`, 'bad'); }
}
async function submit() { try { await api('POST', `/api/packages/${encodeURIComponent(S.pkg.packageId)}/submit`, { at: new Date().toISOString() }); toast('Submitted for approval', 'ok'); await loadPackage(); refreshApprovalSummary(); } catch (e) { toast(`${e.code || 'ERROR'}: ${e.message}`, 'bad'); } }
async function approve() { try { const r = await api('POST', `/api/packages/${encodeURIComponent(S.pkg.packageId)}/approve`, { at: new Date().toISOString() }); toast(`APPROVED · BOM v${r?.package?.revisionNumber || S.pkg.revisionNumber || 1} published`, 'ok'); await loadPackage(); refreshApprovalSummary(); } catch (e) { toast(`${e.code || 'ERROR'}: ${e.message}`, 'bad'); } }
async function revise() { try { const r = await api('POST', `/api/packages/${encodeURIComponent(S.pkg.packageId)}/revision`, { at: new Date().toISOString() }); toast(`DRAFT revision v${r?.package?.revisionNumber || (S.pkg.revisionNumber || 1) + 1} created`, 'ok'); await loadPackage(); } catch (e) { toast(`${e.code || 'ERROR'}: ${e.message}`, 'bad'); } }

// -------- component search / add --------
let searchT;
document.addEventListener('DOMContentLoaded', () => {
  const q = $('#addQ'); if (!q) return;
  q.addEventListener('input', e => {
    clearTimeout(searchT); const term = e.target.value.trim(); const box = $('#addRes');
    if (term.length < 2) { box.hidden = true; return; }
    searchT = setTimeout(async () => {
      try {
        const r = await api('GET', `/api/workspace/components?q=${encodeURIComponent(term)}`);
        const list = r.components || [];
        box.replaceChildren(...list.slice(0, 12).map(k => {
          const st = k.approvalStatus || k.status;
          const usable = st === 'APPROVED' || st === 'ACTIVE';
          const canTemplate = usable && CAN.edit(S.role) && S.pkg && S.pkg.packageState === 'DRAFT';
          return el('div', {
            class: usable ? '' : 'dis',
            title: usable ? 'Add to the DRAFT template (engineering line) or stage as a site add-on' : `${st} — cannot be added to production BOM`,
          },
            el('span', { style: 'flex:1' }, el('b', {}, `${k.brand || ''} `), k.model || k.name || k.componentId, el('small', { style: 'color:var(--mut)' }, ` · ${k.category || ''} · ${k.componentId || k.id}`)),
            el('span', { class: `st ${k.approvalStatus || 'APPROVED'}` }, k.approvalStatus || 'APPROVED'),
            usable ? el('button', { class: 'ic', title: canTemplate ? 'Add to template' : 'Template must be DRAFT (create a revision first)', disabled: canTemplate ? null : 'disabled', onclick: (e) => { e.stopPropagation(); addToTemplate(k); } }, '+ Template') : null,
            usable ? el('button', { class: 'ic', title: 'Stage as site add-on (project-level, never the template)', onclick: (e) => { e.stopPropagation(); addAsAddon(k); } }, '+ Add-on') : null,
          );
        }));
        if (!list.length) box.replaceChildren(el('div', {}, 'No catalog match'));
        box.hidden = false;
      } catch (err) { box.replaceChildren(el('div', {}, `Search failed: ${err.message}`)); box.hidden = false; }
    }, 220);
  });
  document.addEventListener('click', e => { if (!e.target.closest('#addWrap')) $('#addRes').hidden = true; });
});

/**
 * Add an APPROVED catalog component to the DRAFT template as an engineering
 * line. The role is the catalog category (the same vocabulary the package
 * registry already uses — bomRoles maps it to the checker role; Enphase items
 * resolve by componentId). One line per role: an existing role is swapped, not
 * duplicated. Server validates on save / submit / approve — nothing is
 * approved here.
 */
function addToTemplate(k) {
  if (!S.pkg || S.pkg.packageState !== 'DRAFT') return toast('Template must be DRAFT — create a revision first.', 'bad');
  const quantity = Number($('#addQty').value); if (!(quantity > 0)) return toast('Quantity must be > 0', 'bad');
  const componentId = k.componentId || k.id;
  const role = String(k.category || '').trim();
  if (!role) return toast('Catalog item has no category; cannot place it in the template.', 'bad');
  const comps = S.pkg.components.map(c => ({ ...c }));
  const existing = comps.find(c => c.role === role);
  if (existing) {
    if (!confirm(`Template already has a ${role.replace(/_/g, ' ')} line (${existing.componentId} × ${existing.quantity}). Replace it with ${componentId} × ${quantity}?`)) return;
    existing.componentId = componentId; existing.quantity = quantity;
  } else {
    comps.push({ role, componentId, quantity, approvalStatus: k.approvalStatus || null, quantityRule: 'PH_TEMPLATE_EDIT' });
  }
  $('#addQ').value = ''; $('#addRes').hidden = true;
  patchComponents(comps, `Template line ${existing ? 'replaced' : 'added'}: ${role} → ${componentId} × ${quantity}`);
}

function addAsAddon(k) {
  const quantity = Number($('#addQty').value); if (!(quantity > 0)) return toast('Quantity must be > 0', 'bad');
  const role = `SITE_ADDON_${(k.category || 'ITEM').toUpperCase()}_${S.addonAdds.length + 1}`;
  S.addonAdds.push({ role, componentId: k.componentId || k.id, quantity, unit: k.unit });
  $('#addQ').value = ''; $('#addRes').hidden = true;
  renderAddons(); renderTable(); renderSummary();
  toast(`${k.brand || ''} ${k.model || ''} staged as site add-on`, 'ok');
}

document.addEventListener('DOMContentLoaded', () => {
  $('#btnSave')?.addEventListener('click', saveDraft);
  $('#btnCheck')?.addEventListener('click', runCheck);
  $('#btnSubmit')?.addEventListener('click', submit);
  $('#btnApprove')?.addEventListener('click', approve);
  $('#btnRevise')?.addEventListener('click', revise);
  $('#swFR')?.addEventListener('click', () => { $('#swFR').classList.toggle('on'); toast('Future Ready is a distinct approved package variant — filter /api/packages?variant=FUTURE_READY in a future revision.', ''); });
  $('#addonAdd')?.addEventListener('click', () => toast('Use the search field to add a site add-on.', ''));
  boot();
});
